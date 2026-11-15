
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: 150,
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },

    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },

    stock: {
      type: Number,
      required: [true, "Stock is required"],
      min: [0, "Stock cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Stock must be a whole number",
      },
    },

    image: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    has_sizes: {
      type: Boolean,
      default: false,
    },

    sizes: {
      type: [String],
      default: [],
      set(value) {
        if (typeof value === "string") {
          return value
            .split(",")
            .map((size) => size.trim())
            .filter(Boolean);
        }

        return Array.isArray(value)
          ? value.map((size) => String(size).trim()).filter(Boolean)
          : [];
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id.toString();
        ret.is_out_of_stock = ret.stock <= 0;
        delete ret._id;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model("Product", productSchema);
