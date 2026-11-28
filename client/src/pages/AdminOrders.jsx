
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  fetchAdminOrders,
  updateAdminOrderStatus,
  setAdminDeliveryQuote,
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
  const [quoteFees, setQuoteFees] = useState({});

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

async function saveDeliveryQuote(order) {
  if (busyId) return;

  const orderId = order.id ?? order._id;
  const fee = Number(quoteFees[orderId]);

  if (!Number.isFinite(fee) || fee < 0) {
    setError("Enter a valid delivery quote.");
    return;
  }

  setBusyId(orderId);
  setError("");
  setNotice("");

  try {
    const result = await setAdminDeliveryQuote(
      token,
      orderId,
      fee
    );

    if (!result?.success || !result.order) {
      throw new Error("Delivery quote was not saved.");
    }

    setOrders((current) =>
      current.map((item) =>
        (item.id ?? item._id) === orderId
          ? result.order
          : item
      )
    );
    setNotice(
      "Quote saved. Contact the customer so they can approve it in My Orders."
    );
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(token);
    }
    setError(err.message || "Unable to save delivery quote.");
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
            const canCancel = [
              "quote_required",
              "awaiting_quote_approval",
              "pending_payment",
              "pending",
              "processing",
            ].includes(order.status);

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
                    <p>Customer: {order.customer_name}</p>
                    <p>Email: {order.customer_email}</p>
                    <p>Phone: {order.customer_phone}</p>
                  </div>
                  <span className="admin-order-status">
                    {order.status}
                  </span>
                </div>

                <div className="admin-order-fulfillment">
                  <strong>
                    {order.fulfillment_method === "delivery"
                      ? `Delivery · ${order.delivery_area}`
                      : `Pickup · ${order.pickup_location}`}
                  </strong>
                  {order.fulfillment_method === "delivery" && (
                    <p>{order.delivery_address}</p>
                  )}
                  <p>
                    Payment:{" "}
                    {order.payment_method === "paymongo"
                      ? `PayMongo (${order.payment_status})`
                      : `Cash on delivery / pickup (${order.payment_status})`}
                  </p>
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
                    <span>
                      {order.shipping_fee == null
                        ? "Delivery fee: awaiting quote"
                        : `Delivery fee: ${peso(order.shipping_fee)}`}
                    </span>
                    <strong>
                      Total:{" "}
                      {peso(
                        order.total_price +
                          (order.status === "awaiting_quote_approval"
                            ? order.shipping_fee || 0
                            : 0)
                      )}
                    </strong>
                  </div>

                  <div className="admin-order-actions">
                    {order.status === "quote_required" && (
                      <div className="admin-quote-editor">
                        <label htmlFor={`quote-${orderId}`}>
                          Delivery fee (PHP)
                        </label>
                        <input
                          id={`quote-${orderId}`}
                          type="number"
                          min="0"
                          max="100000"
                          step="0.01"
                          value={quoteFees[orderId] ?? ""}
                          onChange={(event) =>
                            setQuoteFees((current) => ({
                              ...current,
                              [orderId]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => saveDeliveryQuote(order)}
                        >
                          Save Quote
                        </button>
                      </div>
                    )}
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
