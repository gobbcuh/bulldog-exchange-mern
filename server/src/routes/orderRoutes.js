
const express = require("express");

const {
    createOrder,
    getMyOrders,
    getAllOrders,
    getOrderById,
    setDeliveryQuote,
    acceptDeliveryQuote,
    rejectDeliveryQuote,
    updateOrderStatus,
} = require("../controllers/orderController");
const {
  createPaymongoCheckout,
} = require("../controllers/paymentController");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createOrder);
router.post("/:id/paymongo-checkout", protect, createPaymongoCheckout);

router.get("/my", protect, getMyOrders);
router.get("/", protect, requireAdmin, getAllOrders);
router.get("/:id", protect, getOrderById);

router.put("/:id/shipping-quote", protect, requireAdmin, setDeliveryQuote);
router.post("/:id/accept-quote", protect, acceptDeliveryQuote);
router.post("/:id/reject-quote", protect, rejectDeliveryQuote);
router.put("/:id", protect, requireAdmin, updateOrderStatus);

module.exports = router;
