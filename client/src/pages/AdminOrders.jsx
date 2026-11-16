
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchAdminOrders,
  updateAdminOrderStatus,
} from "../services/adminOrders";
import "./AdminOrders.css";

const nextStatus = {
  pending: "processing",
  processing: "shipped",
  shipped: "completed",
};

const peso = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

function AdminOrders() {
  const { token, handleUnauthorized } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchAdminOrders(token);
      setOrders(data);
      setError("");
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized(token);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, handleUnauthorized]);

  useEffect(() => {
    // Defer state updates from the async request.
    const id = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadOrders]);

  
async function changeStatus(order, status) {
  if (busyId) return;

  const orderId = order.id ?? order._id;

  if (!orderId) {
    setError("This order has no valid ID.");
    return;
  }

  if (status === "cancelled") {
    const confirmed = window.confirm(
      "Cancel this order and restore its inventory?"
    );

    if (!confirmed) return;
  }

  setBusyId(orderId);
  setError("");
  setNotice("");

  try {
    const result = await updateAdminOrderStatus(
      token,
      orderId,
      status
    );

    if (!result?.success || !result.order) {
      throw new Error("Order update was not confirmed.");
    }

    setOrders((current) =>
      current.map((item) =>
        (item.id ?? item._id) === orderId
          ? result.order
          : item
      )
    );

    setNotice(result.message || "Order updated.");
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(token);
    }

    setError(err.message || "Unable to update order.");
    await loadOrders();
  } finally {
    setBusyId(null);
  }
}

  return (
    <section className="admin-orders-page">
      <p className="admin-orders-eyebrow">
        BULLDOG EXCHANGE / ADMIN
      </p>
      <h1>Order Management</h1>
      <p className="admin-orders-description">
        Review orders and manage fulfillment.
      </p>

      {error && <p role="alert" className="admin-orders-error">{error}</p>}
      {notice && <p role="status" className="admin-orders-notice">{notice}</p>}

      {loading ? (
        <p>Loading orders...</p>
      ) : (
        <div className="admin-orders-list">
          {orders.map((order) => {
            const next = nextStatus[order.status];
            const orderId = order.id ?? order._id;
            const canCancel = ["pending", "processing"].includes(
              order.status
            );

            return (
                <article className="admin-order-card" key={orderId}>
                <div className="admin-order-header">
                  <div>
                    <h2>
                      Order #{String(orderId).slice(-8).toUpperCase()}
                    </h2>
                    <p>
                      {new Date(order.createdAt).toLocaleString("en-PH")}
                    </p>
                    <p>
                      Customer ID: {String(order.user_id)}
                    </p>
                  </div>
                  <span className="admin-order-status">
                    {order.status}
                  </span>
                </div>

                <div className="admin-order-items">
                  {(order.items || []).map((item, index) => (
                    <div key={`${item.product_id}-${index}`}>
                      <span>
                        {item.name}
                        {item.size ? ` (${item.size})` : ""}
                        {" × "}
                        {item.quantity}
                      </span>
                      <strong>
                        {peso(item.price * item.quantity)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="admin-order-bottom">
                  <div>
                    <span>Payment: Cash on Delivery</span>
                    <strong>Total: {peso(order.total_price)}</strong>
                  </div>

                  <div className="admin-order-actions">
                    {next && (
                      <button
                        disabled={Boolean(busyId)}
                        onClick={() => changeStatus(order, next)}
                      >
                        {busyId === order._id
                          ? "Updating..."
                          : `Mark ${next}`}
                      </button>
                    )}

                    {canCancel && (
                      <button
                        className="admin-cancel-order"
                        disabled={Boolean(busyId)}
                        onClick={() =>
                          changeStatus(order, "cancelled")
                        }
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {orders.length === 0 && (
            <p>No orders available.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default AdminOrders;
