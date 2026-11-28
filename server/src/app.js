
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const {
  handlePaymongoWebhook,
} = require("./controllers/paymentController");

const app = express();

function getClientOrigin() {
  if (!process.env.CLIENT_URL) {
    throw new Error("CLIENT_URL is required to configure API CORS");
  }

  let clientUrl;

  try {
    clientUrl = new URL(process.env.CLIENT_URL);
  } catch {
    throw new Error("CLIENT_URL must be a valid client origin");
  }

  if (
    clientUrl.pathname !== "/" ||
    clientUrl.search ||
    clientUrl.hash ||
    (process.env.NODE_ENV === "production" &&
      clientUrl.protocol !== "https:")
  ) {
    throw new Error(
      "CLIENT_URL must be an origin; production client origins must use HTTPS"
    );
  }

  return clientUrl.origin;
}

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: getClientOrigin(),
  })
);

app.post(
  "/api/webhooks/paymongo",
  express.raw({ type: "application/json", limit: "100kb" }),
  handlePaymongoWebhook
);

app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Bulldog Exchange API is running",
  });
});

app.use("/api", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

module.exports = app;
