
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
      enum: ["cod"],
      default: "cod",
    },

    status: {
      type: String,
      enum: [
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

module.exports = mongoose.model("Order", orderSchema);
