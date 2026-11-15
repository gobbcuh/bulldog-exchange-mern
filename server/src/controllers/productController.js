
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");

const allowedFields = [
  "name",
  "category",
  "price",
  "stock",
  "image",
  "description",
  "has_sizes",
  "sizes",
];

function pickProductFields(body) {
  const data = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field];
    }
  }

  return data;
}

function handleProductError(error, res) {
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map(
      (item) => item.message
    );

    return res.status(400).json({
      success: false,
      message: "Product validation failed",
      errors,
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid product data",
    });
  }

  console.error("Product operation failed:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

// GET /api/products
async function getProducts(req, res) {
  try {
    const products = await Product.find().sort({
      createdAt: -1,
    });

    return res.status(200).json(products);
  } catch (error) {
    return handleProductError(error, res);
  }
}

// GET /api/products/:id
async function getProductById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json(product);
  } catch (error) {
    return handleProductError(error, res);
  }
}

// POST /api/products
async function createProduct(req, res) {
  try {
    const data = pickProductFields(req.body);

    const product = await Product.create(data);

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      product,
    });
  } catch (error) {
    return handleProductError(error, res);
  }
}

// PUT /api/products/:id
async function updateProduct(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const data = pickProductFields(req.body);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid product fields provided",
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      data,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    return handleProductError(error, res);
  }
}

// DELETE /api/products/:id
async function deleteProduct(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const activeOrder = await Order.exists({
      "items.product_id": product._id,
      status: {
        $in: ["pending", "processing", "shipped"],
      },
    });

    if (activeOrder) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete a product referenced by an active order",
      });
    }

    await Product.findByIdAndDelete(product._id);

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    return handleProductError(error, res);
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
