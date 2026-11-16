
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");

class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}

// POST /api/orders

async function createOrder(req, res) {
  const items = req.body?.items;
  const paymentMethod = req.body?.payment_method ?? "cod";

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

  if (paymentMethod !== "cod") {
    return res.status(400).json({
      success: false,
      message: "Unsupported payment method",
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

  let session;

  try {
    session = await mongoose.startSession();

    let createdOrder;

    await session.withTransaction(async () => {
      const orderItems = [];
      let totalCents = 0;

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
            `Not enough stock for ${product.name}`
          );
        }

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
            `Not enough stock for ${product.name}`
          );
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
            items: orderItems,
            total_price: totalCents / 100,
            payment_method: paymentMethod,
            status: "pending",
          },
        ],
        { session }
      );

      createdOrder = orders[0];
    });

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order_id: createdOrder._id.toString(),
      total_price: createdOrder.total_price,
      payment_method: createdOrder.payment_method,
    });
  } catch (error) {
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


async function cancelOrder(req, res) {
  let session;

  try {
    session = await mongoose.startSession();

    let cancelledOrder;

    await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          status: { $in: ["pending", "processing"] },
        },
        {
          $set: { status: "cancelled" },
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
        $set: { status },
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
    updateOrderStatus,
};
