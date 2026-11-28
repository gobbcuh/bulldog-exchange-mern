import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAuthenticatedApi } from "../hooks/useAuthenticatedApi";
import {
  createPaymongoCheckout,
  fetchMyOrders,
  respondToDeliveryQuote,
} from "../services/orders";
import "./MyOrders.css";

const peso = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(amount) || 0);

function MyOrders() {
  const { isAuthenticated, handleUnauthorized, token } = useAuth();
  const request = useAuthenticatedApi();
  const location = useLocation();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchMyOrders(request);
      setOrders(data);
      setError("");
      return data;
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized(token);
      }
      setError(err.message || "Unable to load your orders.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized, request, token]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let active = true;
    let timer;
    let retries = location.search.includes("payment=") ? 12 : 0;

    async function refreshOrders() {
      const currentOrders = await loadOrders();

      if (
        active &&
        retries > 0 &&
        currentOrders?.some(
          (order) =>
            order.payment_method === "paymongo" &&
            order.status === "pending_payment"
        )
      ) {
        retries -= 1;
        timer = window.setTimeout(refreshOrders, 5000);
      }
    }

    timer = window.setTimeout(refreshOrders, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, loadOrders, location.search]);

  async function handleQuoteDecision(order, decision) {
    if (busyId) return;

    setBusyId(order.id);
    setError("");
    setNotice("");

    try {
      const result = await respondToDeliveryQuote(
        request,
        order.id,
        decision
      );

      if (
        decision === "accept" &&
        result.order.payment_method === "paymongo"
      ) {
        const checkoutUrl = await createPaymongoCheckout(
          request,
          order.id
        );
        window.location.assign(checkoutUrl);
        return;
      }

      setNotice(result.message);
      await loadOrders();
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized(token);
      }
      setError(err.message || "Unable to update this order.");
      await loadOrders();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePayment(order) {
    if (busyId) return;

    setBusyId(order.id);
    setError("");

    try {
      const checkoutUrl = await createPaymongoCheckout(
        request,
        order.id
      );
      window.location.assign(checkoutUrl);
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized(token);
      }
      setError(err.message || "Unable to start online payment.");
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="my-orders-page">
        <h1>My Orders</h1>
        <p>Sign in to view your orders.</p>
        <a href="/login">Sign In</a>
      </main>
    );
  }

  return (
    <main className="my-orders-page">
      <header>
        <p className="my-orders-eyebrow">BULLDOG EXCHANGE</p>
        <h1>My Orders</h1>
      </header>

      {location.search.includes("payment=") && (
        <p className="my-orders-notice" role="status">
          Payment status is confirmed by PayMongo and may take a moment to update.
        </p>
      )}
      {notice && (
        <p className="my-orders-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="my-orders-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading your orders...</p>
      ) : orders.length === 0 ? (
        <section className="my-orders-empty">
          <h2>No orders yet</h2>
          <p>Your orders and delivery quotes will appear here.</p>
        </section>
      ) : (
        <div className="my-orders-list">
          {orders.map((order) => {
            const orderId = order.id ?? order._id;
            const busy = busyId === orderId;

            return (
              <article className="my-order-card" key={orderId}>
                <header className="my-order-heading">
                  <div>
                    <h2>Order #{String(orderId).slice(-8).toUpperCase()}</h2>
                    <p>
                      {new Date(order.createdAt).toLocaleString("en-PH")}
                    </p>
                  </div>
                  <span>{order.status.replaceAll("_", " ")}</span>
                </header>

                <ul className="my-order-items">
                  {order.items.map((item, index) => (
                    <li key={`${item.product_id}-${index}`}>
                      <span>
                        {item.name}
                        {item.size ? ` (${item.size})` : ""}
                        {" × "}
                        {item.quantity}
                      </span>
                      <strong>{peso(item.price * item.quantity)}</strong>
                    </li>
                  ))}
                </ul>

                <dl className="my-order-details">
                  <div>
                    <dt>Fulfillment</dt>
                    <dd>
                      {order.fulfillment_method === "delivery"
                        ? `Delivery to ${order.delivery_area}`
                        : "Pickup at NU Manila"}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>
                      {order.payment_method === "paymongo"
                        ? `PayMongo (${order.payment_status})`
                        : "Cash on delivery / pickup"}
                    </dd>
                  </div>
                  {order.shipping_fee != null && (
                    <div>
                      <dt>Delivery fee</dt>
                      <dd>{peso(order.shipping_fee)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Total</dt>
                    <dd>
                      {order.shipping_fee == null
                        ? `${peso(order.total_price)} + delivery quote`
                        : peso(order.total_price)}
                    </dd>
                  </div>
                </dl>

                {order.status === "quote_required" && (
                  <p className="my-order-help">
                    The store is preparing a delivery quote. They will contact
                    you at {order.customer_phone}.
                  </p>
                )}

                {order.status === "awaiting_quote_approval" && (
                  <>
                    <p className="my-order-help">
                      Review the delivery fee. Your order total is{" "}
                      {peso(order.total_price + order.shipping_fee)}.
                    </p>
                    <div className="my-order-actions">
                      <button
                        type="button"
                        onClick={() =>
                          handleQuoteDecision(order, "accept")
                        }
                        disabled={busy}
                      >
                        {busy
                          ? "Updating..."
                          : order.payment_method === "paymongo"
                            ? "Accept Quote & Pay"
                            : "Accept Quote"}
                      </button>
                      <button
                        type="button"
                        className="my-order-secondary"
                        onClick={() =>
                          handleQuoteDecision(order, "reject")
                        }
                        disabled={busy}
                      >
                        Decline Quote
                      </button>
                    </div>
                  </>
                )}

                {order.status === "pending_payment" && (
                  <button
                    type="button"
                    className="my-order-pay-button"
                    onClick={() => handlePayment(order)}
                    disabled={busy}
                  >
                    {busy ? "Opening checkout..." : "Continue to PayMongo"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default MyOrders;
