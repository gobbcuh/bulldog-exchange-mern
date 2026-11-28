
const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../src/config/db");
const User = require("../src/models/User");

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = "Bulldog Exchange Admin";
  const campus = "nu manila";

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new Error(
      "Provide a valid ADMIN_EMAIL and a 12–128 character ADMIN_PASSWORD"
    );
  }

  await connectDB();

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new Error(
      "An account already exists with this email. No changes made."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await User.create({
    name,
    email,
    passwordHash,
    campus,
    role: "admin",
  });

  console.log("Administrator account created successfully.");
  console.log(`Account ID: ${admin._id}`);
  console.log(`Role: ${admin.role}`);
}

createAdmin()
  .catch((error) => {
    console.error("Admin provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
