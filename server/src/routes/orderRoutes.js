
const express = require("express");

const {
    createOrder,
    getMyOrders,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
} = require("../controllers/orderController");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createOrder);

router.get("/my", protect, getMyOrders);
router.get("/", protect, requireAdmin, getAllOrders);
router.get("/:id", protect, getOrderById);

router.put("/:id", protect, requireAdmin, updateOrderStatus);

module.exports = router;
