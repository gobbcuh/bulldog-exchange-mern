
require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");
const connectDB = require("./config/db");
const {
  expireAbandonedPaymongoOrders,
} = require("./controllers/paymentController");

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(
        `Bulldog Exchange API running at http://localhost:${PORT}`
      );
    });

    const paymentExpiryTimer = setInterval(() => {
      expireAbandonedPaymongoOrders().catch((error) => {
        console.error(
          "PayMongo expiry worker failed:",
          error.message
        );
      });
    }, 60 * 1000);
    paymentExpiryTimer.unref();

    async function shutdown(signal) {
      console.log(`${signal} received. Shutting down...`);

      clearInterval(paymentExpiryTimer);
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
