
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const crypto = require("node:crypto");

class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}


function createRequestHash(items, paymentMethod, fulfillment) {
  const normalizedItems = items
    .map((item) => ({
      product_id: item.product_id.toString().toLowerCase(),
      size: item.size?.trim() ?? null,
      quantity: item.quantity,
    }))
    .sort((a, b) => {
      const first = JSON.stringify([
        a.product_id,
        a.size,
      ]);

      const second = JSON.stringify([
        b.product_id,
        b.size,
      ]);

      return first.localeCompare(second);
    });

  const payload = JSON.stringify({
    items: normalizedItems,
    payment_method: paymentMethod,
    fulfillment,
  });

  return crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
}

// POST /api/orders

async function createOrder(req, res) {
  const items = req.body?.items;
  const paymentMethod = req.body?.payment_method ?? "cod";
  const fulfillment = req.body?.fulfillment;
  const fulfillmentMethod = fulfillment?.method;
  const customerPhone =
    typeof fulfillment?.phone === "string"
      ? fulfillment.phone.trim()
      : "";

  const idempotencyKey = req.get("Idempotency-Key");

  if (
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid Idempotency-Key header is required",
    });
  }


  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "An order must contain at least one item",
    });
  }

  if (items.length > 50) {
    return res.status(400).json({
      success: false,
      message: "Too many items in one order",
    });
  }

  if (!["cod", "paymongo"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Unsupported payment method",
    });
  }

  if (
    !fulfillment ||
    !["pickup", "delivery"].includes(fulfillmentMethod) ||
    !/^\+?[0-9][0-9\s()-]{6,28}$/.test(customerPhone)
  ) {
    return res.status(400).json({
      success: false,
      message: "Choose a fulfillment method and enter a valid phone number",
    });
  }

  const normalizedFulfillment = {
    method: fulfillmentMethod,
    phone: customerPhone,
    pickup_location:
      fulfillmentMethod === "pickup"
        ? fulfillment.pickup_location
        : null,
    delivery_area:
      fulfillmentMethod === "delivery"
        ? fulfillment.delivery_area
        : null,
    delivery_address:
      fulfillmentMethod === "delivery" &&
      typeof fulfillment.delivery_address === "string"
        ? fulfillment.delivery_address.trim()
        : null,
  };

  if (
    (fulfillmentMethod === "pickup" &&
      normalizedFulfillment.pickup_location !== "nu manila") ||
    (fulfillmentMethod === "delivery" &&
      (!["manila", "laguna", "cebu", "davao"].includes(
        normalizedFulfillment.delivery_area
      ) ||
        !normalizedFulfillment.delivery_address ||
        normalizedFulfillment.delivery_address.length < 10 ||
        normalizedFulfillment.delivery_address.length > 500))
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter valid fulfillment details",
    });
  }

  const seenVariants = new Set();
  const quantitiesByProduct = new Map();

  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !mongoose.isValidObjectId(item.product_id) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1000 ||
      (item.size != null &&
        (typeof item.size !== "string" ||
          item.size.trim().length === 0 ||
          item.size.trim().length > 20))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID, quantity, or size",
      });
    }

    const productId = item.product_id.toString().toLowerCase();
    const size = item.size?.trim() ?? null;
    const variantKey = JSON.stringify([productId, size]);

    if (seenVariants.has(variantKey)) {
      return res.status(400).json({
        success: false,
        message: "Duplicate product and size combinations are not allowed",
      });
    }

    seenVariants.add(variantKey);

    quantitiesByProduct.set(
      productId,
      (quantitiesByProduct.get(productId) ?? 0) + item.quantity
    );
  }

  const requestHash = createRequestHash(
    items,
    paymentMethod,
    normalizedFulfillment
  );

  try {
    const existingOrder = await Order.findOne({
      user_id: req.user._id,
      idempotency_key: idempotencyKey,
    });

    if (existingOrder) {
      if (existingOrder.request_hash !== requestHash) {
        return res.status(409).json({
          success: false,
          message: "Idempotency key was already used for a different order",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Order already placed",
        order_id: existingOrder._id.toString(),
        total_price: existingOrder.total_price,
        payment_method: existingOrder.payment_method,
        fulfillment_method: existingOrder.fulfillment_method,
        status: existingOrder.status,
        replayed: true,
      });
    }
  } catch (error) {
    console.error("Idempotency lookup failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify checkout request",
    });
  }

  let session;

  try {
    session = await mongoose.startSession();

    let createdOrder;

    await session.withTransaction(async () => {
      const orderItems = [];
      let totalCents = 0;
      const stockReserved = fulfillmentMethod === "pickup";

      // Validate and deduct inventory once per product.
      const productsById = new Map();

      for (const [productId, totalQuantity] of quantitiesByProduct) {
        const product = await Product.findById(productId).session(session);

        if (!product) {
          throw new CheckoutError(
            "One or more products were not found",
            404
          );
        }

        if (product.stock < totalQuantity) {
          throw new CheckoutError(
            `Not enough stock for ${product.name}`,
            409
          );
        }

        if (stockReserved) {
          const updatedProduct = await Product.findOneAndUpdate(
            {
              _id: product._id,
              stock: { $gte: totalQuantity },
            },
            {
              $inc: { stock: -totalQuantity },
            },
            {
              new: true,
              session,
            }
          );

          if (!updatedProduct) {
            throw new CheckoutError(
              `Not enough stock for ${product.name}`,
              409
            );
          }
        }

        productsById.set(productId, product);
      }

      for (const item of items) {
        const productId = item.product_id.toString().toLowerCase();
        const product = productsById.get(productId);
        const size = item.size?.trim() ?? null;

        if (product.has_sizes) {
          if (!size || !product.sizes.includes(size)) {
            throw new CheckoutError(
              `Invalid size selected for ${product.name}`
            );
          }
        } else if (size !== null) {
          throw new CheckoutError(
            `${product.name} does not require a size`
          );
        }

        const priceCents = Math.round(product.price * 100);

        if (
          !Number.isSafeInteger(priceCents) ||
          priceCents < 0
        ) {
          throw new CheckoutError("Invalid product price");
        }

        const lineTotal = priceCents * item.quantity;

        if (!Number.isSafeInteger(lineTotal)) {
          throw new CheckoutError(
            "Order total exceeds supported range"
          );
        }

        totalCents += lineTotal;

        if (!Number.isSafeInteger(totalCents)) {
          throw new CheckoutError(
            "Order total exceeds supported range"
          );
        }

        orderItems.push({
          product_id: product._id,
          name: product.name,
          size,
          quantity: item.quantity,
          price: priceCents / 100,
        });
      }

      const orders = await Order.create(
        [
          {
            user_id: req.user._id,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            items: orderItems,
            total_price: totalCents / 100,
            customer_name: req.user.name,
            customer_email: req.user.email,
            customer_phone: customerPhone,
            fulfillment_method: fulfillmentMethod,
            pickup_location: normalizedFulfillment.pickup_location,
            delivery_area: normalizedFulfillment.delivery_area,
            delivery_address: normalizedFulfillment.delivery_address,
            shipping_fee:
              fulfillmentMethod === "pickup" ? 0 : null,
            stock_reserved: stockReserved,
            payment_method: paymentMethod,
            payment_status:
              paymentMethod === "paymongo" ? "pending" : "unpaid",
            payment_expires_at:
              paymentMethod === "paymongo"
                ? new Date(Date.now() + 30 * 60 * 1000)
                : null,
            status:
              fulfillmentMethod === "delivery"
                ? "quote_required"
                : paymentMethod === "paymongo"
                  ? "pending_payment"
                  : "pending",
          },
        ],
        { session }
      );

      createdOrder = orders[0];
    });

    return res.status(201).json({
      success: true,
      message:
        fulfillmentMethod === "delivery"
          ? "Delivery request submitted for a shipping quote"
          : paymentMethod === "paymongo"
            ? "Order created; online payment is pending"
            : "Order placed successfully",
      order_id: createdOrder._id.toString(),
      total_price: createdOrder.total_price,
      payment_method: createdOrder.payment_method,
      fulfillment_method: createdOrder.fulfillment_method,
      status: createdOrder.status,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A checkout request with this idempotency key already exists. Please retry with the same key.",
      });
    }

    if (error instanceof CheckoutError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Order validation failed",
      });
    }

    console.error("Checkout failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to place order",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

async function getMyOrders(req, res) {
  try {
    const orders = await Order.find({
      user_id: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Failed to retrieve customer orders:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve orders",
    });
  }
}

async function getAllOrders(req, res) {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json(orders);
  } catch (error) {
    console.error("Failed to retrieve orders:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve orders",
    });
  }
}

async function getOrderById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const isOwner = order.user_id.equals(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error("Failed to retrieve order:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve order",
    });
  }
}

async function setDeliveryQuote(req, res) {
  const { id } = req.params;
  const shippingFee = req.body?.shipping_fee;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID",
    });
  }

  if (
    typeof shippingFee !== "number" ||
    !Number.isFinite(shippingFee) ||
    shippingFee < 0 ||
    shippingFee > 100000
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid delivery quote",
    });
  }

  try {
    const feeCents = Math.round(shippingFee * 100);

    if (!Number.isSafeInteger(feeCents)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid delivery quote",
      });
    }

    const order = await Order.findOneAndUpdate(
      {
        _id: id,
        fulfillment_method: "delivery",
        status: "quote_required",
      },
      {
        $set: {
          shipping_fee: feeCents / 100,
          status: "awaiting_quote_approval",
          quote_created_at: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!order) {
      return res.status(409).json({
        success: false,
        message: "This order is not awaiting a delivery quote",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery quote saved; contact the customer for approval",
      order,
    });
  } catch (error) {
    console.error("Failed to save delivery quote:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save delivery quote",
    });
  }
}

async function acceptDeliveryQuote(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID",
    });
  }

  let session;

  try {
    session = await mongoose.startSession();
    let acceptedOrder;

    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: id,
        user_id: req.user._id,
        status: "awaiting_quote_approval",
        fulfillment_method: "delivery",
      }).session(session);

      if (!order) {
        throw new CheckoutError(
          "This delivery quote is no longer available",
          409
        );
      }

      const quantitiesByProduct = new Map();
      for (const item of order.items) {
        const productId = item.product_id.toString();
        quantitiesByProduct.set(
          productId,
          (quantitiesByProduct.get(productId) ?? 0) + item.quantity
        );
      }

      for (const [productId, quantity] of quantitiesByProduct) {
        const product = await Product.findOneAndUpdate(
          {
            _id: productId,
            stock: { $gte: quantity },
          },
          {
            $inc: { stock: -quantity },
          },
          {
            new: true,
            session,
          }
        );

        if (!product) {
          throw new CheckoutError(
            "Some items are no longer available. Contact the store.",
            409
          );
        }

        const orderedItems = order.items.filter(
          (item) => item.product_id.toString() === productId
        );
        const invalidVariant = orderedItems.some((item) =>
          product.has_sizes
            ? !item.size || !product.sizes.includes(item.size)
            : item.size !== null
        );

        if (invalidVariant) {
          throw new CheckoutError(
            `${product.name} is no longer available in the requested size`,
            409
          );
        }
      }

      const subtotalCents = order.items.reduce(
        (total, item) =>
          total + Math.round(item.price * 100) * item.quantity,
        0
      );
      const shippingCents = Math.round(order.shipping_fee * 100);
      const paymentMethod = order.payment_method;

      if (
        !Number.isSafeInteger(subtotalCents) ||
        !Number.isSafeInteger(shippingCents) ||
        !Number.isSafeInteger(subtotalCents + shippingCents)
      ) {
        throw new CheckoutError("Order total exceeds supported range");
      }

      acceptedOrder = await Order.findOneAndUpdate(
        {
          _id: id,
          user_id: req.user._id,
          status: "awaiting_quote_approval",
        },
        {
          $set: {
            status:
              paymentMethod === "paymongo"
                ? "pending_payment"
                : "pending",
            payment_status:
              paymentMethod === "paymongo" ? "pending" : "unpaid",
            total_price: (subtotalCents + shippingCents) / 100,
            stock_reserved: true,
            payment_expires_at:
              paymentMethod === "paymongo"
                ? new Date(Date.now() + 30 * 60 * 1000)
                : null,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!acceptedOrder) {
        throw new CheckoutError(
          "This delivery quote is no longer available",
          409
        );
      }
    });

    return res.status(200).json({
      success: true,
      message:
        acceptedOrder.payment_method === "paymongo"
          ? "Quote accepted; continue to online payment"
          : "Quote accepted; your order is confirmed",
      order: acceptedOrder,
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Failed to accept delivery quote:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to accept delivery quote",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

async function rejectDeliveryQuote(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID",
    });
  }

  try {
    const filter = {
      _id: id,
      user_id: req.user._id,
      status: "awaiting_quote_approval",
      stock_reserved: false,
    };
    const existingOrder = await Order.findOne(filter).select(
      "payment_method"
    );

    if (!existingOrder) {
      return res.status(409).json({
        success: false,
        message: "This delivery quote can no longer be declined",
      });
    }

    const order = await Order.findOneAndUpdate(
      filter,
      {
        $set: {
          status: "cancelled",
          ...(existingOrder.payment_method === "paymongo"
            ? { payment_status: "failed" }
            : {}),
        },
      },
      {
        new: true,
      }
    );

    if (!order) {
      return res.status(409).json({
        success: false,
        message: "This delivery quote can no longer be declined",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery quote declined",
      order,
    });
  } catch (error) {
    console.error("Failed to decline delivery quote:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to decline delivery quote",
    });
  }
}

async function cancelOrder(req, res) {
  let session;

  try {
    session = await mongoose.startSession();

    let cancelledOrder;

    await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          status: {
            $in: [
              "quote_required",
              "awaiting_quote_approval",
              "pending",
              "processing",
              "pending_payment",
            ],
          },
          payment_status: { $ne: "paid" },
          payment_session_creating: { $ne: true },
        },
        {
          $set: {
            status: "cancelled",
            payment_expires_at: null,
            payment_session_creating: false,
            payment_session_started_at: null,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!order) {
        const error = new Error("Order cannot be cancelled");
        error.status = 409;
        throw error;
      }

      if (
        order.payment_method === "paymongo" &&
        order.paymongo_checkout_session_id
      ) {
        const error = new Error(
          "Expire the PayMongo checkout session before cancelling this order"
        );
        error.status = 409;
        throw error;
      }

      if (order.payment_method === "paymongo") {
        await Order.updateOne(
          { _id: order._id, status: "cancelled" },
          { $set: { payment_status: "failed" } },
          { session }
        );
        order.payment_status = "failed";
      }

      const stockWasReserved = order.stock_reserved !== false;

      if (stockWasReserved) {
        for (const item of order.items) {
          const result = await Product.updateOne(
            { _id: item.product_id },
            { $inc: { stock: item.quantity } },
            { session }
          );

          if (result.matchedCount !== 1) {
            throw new Error(
              "Cannot restore inventory for a missing product"
            );
          }
        }
      }

      const reservationUpdated = await Order.updateOne(
        { _id: order._id, status: "cancelled" },
        { $set: { stock_reserved: false } },
        { session }
      );

      if (reservationUpdated.matchedCount !== 1) {
        throw new Error("Cannot update the cancelled order reservation");
      }

      order.stock_reserved = false;
      cancelledOrder = order;
    });

    return res.status(200).json({
      success: true,
      message: "Order cancelled and inventory restored",
      order: cancelledOrder,
    });
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Order cancellation failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel order",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    if (status === "cancelled") {
        return cancelOrder(req, res);
    }

    const allowedTransitions = {
      pending: "processing",
      processing: "shipped",
      shipped: "completed",
    };

    if (!Object.values(allowedTransitions).includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status update",
      });
    }

    const previousStatus = Object.keys(allowedTransitions).find(
      (key) => allowedTransitions[key] === status
    );

    const order = await Order.findOneAndUpdate(
      {
        _id: id,
        status: previousStatus,
      },
      {
        $set: {
          status,
          ...(status === "completed"
            ? { payment_status: "paid" }
            : {}),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!order) {
      const exists = await Order.exists({ _id: id });

      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? "Order cannot transition to the requested status"
          : "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated",
      order,
    });
  } catch (error) {
    console.error("Failed to update order status:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update order status",
    });
  }
}

module.exports = {
    createOrder,
    getMyOrders,
    getAllOrders,
    getOrderById,
    setDeliveryQuote,
    acceptDeliveryQuote,
    rejectDeliveryQuote,
    updateOrderStatus,
};
