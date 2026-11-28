
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const campusGroups = require("../../../shared/campuses.json");
const User = require("../models/User");

const allowedCampuses = new Set(
  campusGroups.flatMap((group) =>
    group.campuses.map((campus) => campus.value)
  )
);

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    campus: user.campus,
    role: user.role,
  };
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "2h",
    }
  );
}

// POST /api/register
async function register(req, res) {
  try {
    const { name, email, password, campus } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof campus !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !campus.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and campus are required",
      });
    }

    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password must contain 12 to 128 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCampus = campus.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (!allowedCampuses.has(normalizedCampus)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid NU campus",
      });
    }

    if (!normalizedEmail.endsWith("@nu.edu.ph")) {
      return res.status(400).json({
        success: false,
        message: "Use an email address ending in @nu.edu.ph",
      });
    }

    const existingUser = await User.exists({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      campus: normalizedCampus,
      role: "user",
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid registration information",
      });
    }

    console.error("Registration failed:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

// POST /api/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    const validPassword = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

module.exports = {
  register,
  login,
};
