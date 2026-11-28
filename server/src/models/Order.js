
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    size: {
      type: String,
      trim: true,
      default: null,
      maxlength: 20,
    },    

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const orderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    customer_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    customer_email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    customer_phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    fulfillment_method: {
      type: String,
      enum: ["pickup", "delivery"],
      required: true,
    },

    pickup_location: {
      type: String,
      enum: ["nu manila"],
      default: null,
    },

    delivery_area: {
      type: String,
      enum: ["manila", "laguna", "cebu", "davao"],
      default: null,
    },

    delivery_address: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    shipping_fee: {
      type: Number,
      min: 0,
      default: null,
    },

    stock_reserved: {
      type: Boolean,
      default: true,
    },

    idempotency_key: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    request_hash: {
      type: String,
      match: /^[a-f0-9]{64}$/,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator(items) {
          return items.length > 0;
        },
        message: "An order must contain at least one item",
      },
    },

    total_price: {
      type: Number,
      required: true,
      min: 0,
    },

    payment_method: {
      type: String,
      enum: ["cod", "paymongo"],
      default: "cod",
    },

    payment_status: {
      type: String,
      enum: ["unpaid", "pending", "paid", "failed", "refunded"],
      default: "unpaid",
    },

    paymongo_checkout_session_id: {
      type: String,
      trim: true,
      default: null,
    },

    paymongo_checkout_url: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    payment_session_creating: {
      type: Boolean,
      default: false,
    },

    payment_session_started_at: {
      type: Date,
      default: null,
    },

    payment_expires_at: {
      type: Date,
      default: null,
    },

    quote_created_at: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "quote_required",
        "awaiting_quote_approval",
        "pending_payment",
        "pending",
        "processing",
        "shipped",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id.toString();
        ret.user_id = ret.user_id.toString();

        ret.items = ret.items.map((item) => ({
          ...item,
          product_id: item.product_id.toString(),
        }));

        delete ret._id;
        return ret;
      },
    },
  }
);

orderSchema.index(
  { user_id: 1, idempotency_key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotency_key: { $type: "string" },
    },
  }
);

module.exports = mongoose.model("Order", orderSchema);
