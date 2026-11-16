
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Product = require("../src/models/Product");

const products = [
  {
    name: "NU Classic Bulldog Tee",
    category: "Apparel",
    price: 499,
    stock: 40,
    description:
      "Navy blue university-inspired T-shirt with yellow Bulldog Exchange branding.",
    has_sizes: true,
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
  },
  {
    name: "NU Varsity Hoodie",
    category: "Apparel",
    price: 1250,
    stock: 25,
    description:
      "Comfortable navy blue hoodie with university-inspired varsity detailing.",
    has_sizes: true,
    sizes: ["S", "M", "L", "XL"],
  },
  {
    name: "NU University Polo Shirt",
    category: "Apparel",
    price: 699,
    stock: 30,
    description:
      "Classic collared polo shirt for a clean university-inspired look.",
    has_sizes: true,
    sizes: ["S", "M", "L", "XL", "XXL"],
  },
  {
    name: "NU Varsity Jacket",
    category: "Apparel",
    price: 1899,
    stock: 15,
    description:
      "Navy and yellow varsity-style jacket for Bulldog Exchange supporters.",
    has_sizes: true,
    sizes: ["S", "M", "L", "XL"],
  },
  {
    name: "Bulldog Embroidered Cap",
    category: "Accessories",
    price: 350,
    stock: 30,
    description:
      "Adjustable cap with embroidered Bulldog-inspired detailing.",
    has_sizes: false,
    sizes: [],
  },
  {
    name: "NU ID Lace",
    category: "Accessories",
    price: 120,
    stock: 60,
    description:
      "University-inspired identification card lanyard.",
    has_sizes: false,
    sizes: [],
  },
  {
    name: "NU Canvas Tote Bag",
    category: "Accessories",
    price: 299,
    stock: 35,
    description:
      "Reusable canvas tote bag for books and everyday essentials.",
    has_sizes: false,
    sizes: [],
  },
  {
    name: "NU Stainless Tumbler",
    category: "Drinkware",
    price: 599,
    stock: 20,
    description:
      "Reusable stainless steel tumbler with Bulldog Exchange branding.",
    has_sizes: false,
    sizes: [],
  },
  {
    name: "NU Spiral Notebook",
    category: "Stationery",
    price: 149,
    stock: 50,
    description:
      "Spiral-bound notebook for classes, notes, and everyday writing.",
    has_sizes: false,
    sizes: [],
  },
  {
    name: "Bulldog Sticker Pack",
    category: "Stationery",
    price: 99,
    stock: 75,
    description:
      "Assorted university-inspired stickers for laptops and notebooks.",
    has_sizes: false,
    sizes: [],
  },
];

async function seedProducts() {
  try {
    await connectDB();

    const names = products.map((product) => product.name);

    const existingProducts = await Product.find({
      name: { $in: names },
    })
      .select("name")
      .lean();

    const existingNames = new Set(
      existingProducts.map((product) => product.name)
    );

    const newProducts = products.filter(
      (product) => !existingNames.has(product.name)
    );

    if (newProducts.length === 0) {
      console.log("All sample products already exist.");
      return;
    }

    const insertedProducts = await Product.insertMany(
      newProducts,
      { ordered: true }
    );

    console.log(
      `Inserted ${insertedProducts.length} sample products.`
    );

    console.log(
      insertedProducts.map((product) => product.name)
    );
  } catch (error) {
    console.error("Product seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedProducts();
