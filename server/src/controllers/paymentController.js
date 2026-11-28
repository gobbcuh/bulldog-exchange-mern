const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");

const PAYMONGO_API = "https://api.paymongo.com";
const PAYMENT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

function getSecretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY;

  if (!key || !/^sk_(test|live)_/.test(key)) {
    throw new Error("PayMongo secret key is not configured");
  }

  return key;
}

function getClientUrl() {
  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) {
    throw new Error("CLIENT_URL is not configured");
  }

  return clientUrl.replace(/\/+$/, "");
}

function paymongoHeaders(secretKey) {
  return {
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function createPaymongoCheckout(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID",
    });
  }

  let secretKey;
  let clientUrl;

  try {
    secretKey = getSecretKey();
    clientUrl = getClientUrl();
    if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
      throw new Error("PayMongo webhook secret is not configured");
    }
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: "Online payment is not configured yet",
    });
  }

  let order;

  try {
    order = await Order.findOne({
      _id: id,
      user_id: req.user._id,
      payment_method: "paymongo",
      status: "pending_payment",
      payment_status: "pending",
      payment_expires_at: { $gt: new Date() },
    }).select("+paymongo_checkout_url");
  } catch (error) {
    console.error("Could not load online payment order:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start online payment",
    });
  }

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order is not available for online payment",
    });
  }

  if (order.paymongo_checkout_url) {
    return res.status(200).json({
      success: true,
      checkout_url: order.paymongo_checkout_url,
    });
  }

  let claimedOrder;

  try {
    claimedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: "pending_payment",
        payment_status: "pending",
        payment_expires_at: { $gt: new Date() },
        payment_session_creating: { $ne: true },
        paymongo_checkout_session_id: null,
      },
      {
        $set: {
          payment_session_creating: true,
          payment_session_started_at: new Date(),
        },
      },
      {
        new: true,
      }
    );
  } catch (error) {
    console.error("Could not claim PayMongo checkout:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start online payment",
    });
  }

  if (!claimedOrder) {
    return res.status(409).json({
      success: false,
      message: "Payment setup is already in progress. Please retry shortly.",
    });
  }

  try {
    const lineItems = claimedOrder.items.map((item) => ({
      name: item.size
        ? `${item.name} (${item.size})`
        : item.name,
      amount: Math.round(item.price * 100),
      currency: "PHP",
      quantity: item.quantity,
    }));

    if (claimedOrder.shipping_fee > 0) {
      lineItems.push({
        name: "Delivery",
        amount: Math.round(claimedOrder.shipping_fee * 100),
        currency: "PHP",
        quantity: 1,
      });
    }

    const paymentMethods = (
      process.env.PAYMONGO_PAYMENT_METHOD_TYPES ||
      "card,gcash,qrph"
    )
      .split(",")
      .map((method) => method.trim())
      .filter(Boolean);

    const response = await fetch(
      `${PAYMONGO_API}/v2/checkout_sessions`,
      {
        method: "POST",
        headers: paymongoHeaders(secretKey),
        signal: AbortSignal.timeout(15 * 1000),
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: lineItems,
              payment_method_types: paymentMethods,
              success_url: `${clientUrl}/orders?payment=success`,
              cancel_url: `${clientUrl}/orders?payment=cancelled`,
              reference_number: claimedOrder._id.toString(),
              send_email_receipt: true,
              pass_on_fees: false,
              billing: {
                name: claimedOrder.customer_name,
                email: claimedOrder.customer_email,
              },
            },
          },
        }),
      }
    );

    const data = await response.json();
    const checkoutSession = data?.data;
    const checkoutUrl = checkoutSession?.attributes?.checkout_url;

    if (
      !response.ok ||
      typeof checkoutSession?.id !== "string" ||
      typeof checkoutUrl !== "string" ||
      !checkoutUrl.startsWith("https://")
    ) {
      console.error(
        "PayMongo checkout creation failed:",
        response.status,
        data?.errors || "Invalid checkout response"
      );
      throw new Error("PayMongo did not create a checkout session");
    }

    await Order.updateOne(
      {
        _id: claimedOrder._id,
        status: "pending_payment",
        payment_status: "pending",
      },
      {
        $set: {
          paymongo_checkout_session_id: checkoutSession.id,
          paymongo_checkout_url: checkoutUrl,
          payment_expires_at: new Date(
            Date.now() + PAYMENT_SESSION_LIFETIME_MS
          ),
          payment_session_creating: false,
          payment_session_started_at: null,
        },
      }
    );

    return res.status(200).json({
      success: true,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    await Order.updateOne(
      {
        _id: claimedOrder._id,
        payment_session_creating: true,
      },
      {
        $set: {
          payment_session_creating: false,
          payment_session_started_at: null,
        },
      }
    );

    if (error.name !== "Error" || error.message !== "fetch failed") {
      console.error("Could not create PayMongo checkout:", error.message);
    }

    return res.status(502).json({
      success: false,
      message: "Unable to start online payment. Please try again.",
    });
  }
}

function verifyWebhookSignature(rawBody, signatureHeader, livemode) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (
    typeof secret !== "string" ||
    !secret ||
    typeof signatureHeader !== "string"
  ) {
    return false;
  }

  const signature = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...valueParts] = part.trim().split("=");
      return [key, valueParts.join("=")];
    })
  );
  const timestamp = Number(signature.t);
  const receivedSignature = livemode ? signature.li : signature.te;

  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000 ||
    typeof receivedSignature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(receivedSignature)
  ) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${signature.t}.${rawBody.toString("utf8")}`)
    .digest();
  const actualSignature = Buffer.from(receivedSignature, "hex");

  return (
    actualSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(actualSignature, expectedSignature)
  );
}

async function handlePaymongoWebhook(req, res) {
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook body",
    });
  }

  let event;

  try {
    event = JSON.parse(req.body.toString("utf8"))?.data;
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook JSON",
    });
  }

  const livemode = event?.livemode === true;
  const secretKey = process.env.PAYMONGO_SECRET_KEY || "";
  const keyIsLive = secretKey.startsWith("sk_live_");

  if (
    !event ||
    livemode !== keyIsLive ||
    !verifyWebhookSignature(
      req.body,
      req.get("Paymongo-Signature"),
      livemode
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  if (event.type !== "checkout_session.payment.paid") {
    return res.status(200).json({ received: true });
  }

  const checkoutSession = event.data;
  const attributes = checkoutSession?.attributes;
  const orderId = attributes?.reference_number;
  const paidPayment = attributes?.payments?.find(
    (payment) => payment?.attributes?.status === "paid"
  );

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof checkoutSession.id !== "string" ||
    !paidPayment
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid paid checkout event",
    });
  }

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.payment_status === "paid") {
      return res.status(200).json({ received: true });
    }

    const paidAttributes = paidPayment.attributes;
    const expectedAmount = Math.round(order.total_price * 100);

    if (
      order.payment_method !== "paymongo" ||
      order.status !== "pending_payment" ||
      (order.paymongo_checkout_session_id &&
        order.paymongo_checkout_session_id !== checkoutSession.id) ||
      paidAttributes.currency?.toUpperCase() !== "PHP" ||
      paidAttributes.amount !== expectedAmount
    ) {
      console.error(
        "PayMongo webhook did not match its order:",
        orderId
      );

      return res.status(409).json({
        success: false,
        message: "Payment does not match the order",
      });
    }

    await Order.updateOne(
      {
        _id: order._id,
        status: "pending_payment",
        payment_status: "pending",
      },
      {
        $set: {
          status: "pending",
          payment_status: "paid",
          paymongo_checkout_session_id: checkoutSession.id,
          payment_expires_at: null,
          payment_session_creating: false,
          payment_session_started_at: null,
        },
      }
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("PayMongo webhook processing failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process payment notification",
    });
  }
}

async function expirePaymongoCheckout(sessionId, secretKey) {
  const response = await fetch(
    `${PAYMONGO_API}/v1/checkout_sessions/${encodeURIComponent(sessionId)}/expire`,
    {
      method: "POST",
      headers: paymongoHeaders(secretKey),
    }
  );

  if (response.ok) {
    return true;
  }

  if (response.status !== 400) {
    return false;
  }

  const lookup = await fetch(
    `${PAYMONGO_API}/v1/checkout_sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: paymongoHeaders(secretKey),
    }
  );
  const data = await lookup.json();

  return data?.data?.attributes?.status === "expired";
}

async function expireAbandonedPaymongoOrders() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;

  if (!secretKey) {
    return;
  }

  const now = new Date();
  const staleCreatingBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const expiredOrders = await Order.find({
    status: "pending_payment",
    payment_status: "pending",
    payment_expires_at: { $lte: now },
    $or: [
      { paymongo_checkout_session_id: { $type: "string" } },
      { payment_session_creating: { $ne: true } },
      { payment_session_started_at: { $lte: staleCreatingBefore } },
    ],
  }).limit(20);

  for (const order of expiredOrders) {
    let sessionExpired = !order.paymongo_checkout_session_id;

    if (order.paymongo_checkout_session_id) {
      try {
        sessionExpired = await expirePaymongoCheckout(
          order.paymongo_checkout_session_id,
          secretKey
        );
      } catch (error) {
        console.error(
          "Could not expire abandoned PayMongo checkout:",
          order._id.toString(),
          error.message
        );
        continue;
      }
    }

    if (!sessionExpired) {
      continue;
    }

    let session;

    try {
      session = await mongoose.startSession();

      await session.withTransaction(async () => {
        const cancelledOrder = await Order.findOneAndUpdate(
          {
            _id: order._id,
            status: "pending_payment",
            payment_status: "pending",
            paymongo_checkout_session_id:
              order.paymongo_checkout_session_id,
          },
          {
            $set: {
              status: "cancelled",
              payment_status: "failed",
              stock_reserved: false,
              payment_expires_at: null,
            },
          },
          {
            new: true,
            session,
          }
        );

        if (!cancelledOrder || order.stock_reserved === false) {
          return;
        }

        for (const item of cancelledOrder.items) {
          const result = await Product.updateOne(
            { _id: item.product_id },
            { $inc: { stock: item.quantity } },
            { session }
          );

          if (result.matchedCount !== 1) {
            throw new Error(
              "Cannot restore inventory for an expired payment"
            );
          }
        }
      });
    } catch (error) {
      console.error(
        "Could not release stock for expired payment:",
        order._id.toString(),
        error.message
      );
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
}

module.exports = {
  createPaymongoCheckout,
  handlePaymongoWebhook,
  expireAbandonedPaymongoOrders,
};
