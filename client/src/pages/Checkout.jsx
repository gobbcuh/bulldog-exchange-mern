
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useAuthenticatedApi } from "../hooks/useAuthenticatedApi";
import { createOrder } from "../services/orders";
import "./Checkout.css";

const ATTEMPT_PREFIX = "bulldog-checkout-attempt-";

const formatPrice = (value) =>
  Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function storageKey(customerId) {
  return `${ATTEMPT_PREFIX}${customerId}`;
}

function snapshotCart(cart) {
  return cart.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    ...(item.size ? { size: item.size } : {}),
  }));
}

function fingerprint(items) {
  return JSON.stringify(
    items
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        size: item.size ?? null,
      }))
      .sort((a, b) =>
        JSON.stringify([a.productId, a.size]).localeCompare(
          JSON.stringify([b.productId, b.size])
        )
      )
  );
}

function readAttempt(customerId) {
  if (!customerId) return null;

  try {
    const raw = sessionStorage.getItem(storageKey(customerId));
    if (!raw) return null;

    const attempt = JSON.parse(raw);

    if (
      attempt?.customerId !== customerId ||
      typeof attempt.key !== "string" ||
      !Array.isArray(attempt.items) ||
      attempt.items.length === 0 ||
      !attempt.items.every(
        (item) =>
          typeof item.productId === "string" &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0 &&
          (item.size === undefined ||
            typeof item.size === "string")
      )
    ) {
      throw new Error("Invalid saved checkout attempt.");
    }

    return attempt;
  } catch {
    // Fail closed: do not create a new order while
    // saved checkout data is unreadable.
    throw new Error(
      "Saved checkout data could not be read. " +
      "Please check this browser's session storage " +
      "before attempting another order."
    );
  }
}

function Checkout() {
  const { user, isAuthenticated } = useAuth();
  const { cart, cartCount, cartTotal, clearCart } = useCart();
  const request = useAuthenticatedApi();

  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const customerId = user?.id;

  // An attempt saved before a refresh is recovered here.
  let savedAttempt = null;
  let storageError = "";

  if (customerId && !confirmation) {
    try {
      savedAttempt = readAttempt(customerId);
    } catch (err) {
      storageError = err.message;
    }
  }

  const activeAttempt =
    attempt?.customerId === customerId
      ? attempt
      : savedAttempt;

  const cartChanged =
    activeAttempt &&
    fingerprint(activeAttempt.items) !==
      fingerprint(snapshotCart(cart));

  async function handlePlaceOrder() {
    if (
      submittingRef.current ||
      !isAuthenticated ||
      !customerId ||
      confirmation ||
      storageError
    ) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError("");

    try {
      // Always reuse an unresolved attempt, including
      // its original items, even if the cart changed.
      let currentAttempt = readAttempt(customerId);

      if (!currentAttempt) {
        if (cart.length === 0) {
          throw new Error("Your cart is empty.");
        }

        currentAttempt = {
          customerId,
          key: crypto.randomUUID(),
          items: snapshotCart(cart),
        };

        // Save BEFORE sending the request.
        sessionStorage.setItem(
          storageKey(customerId),
          JSON.stringify(currentAttempt)
        );
      }

      setAttempt(currentAttempt);

      const result = await createOrder(
        request,
        currentAttempt.items,
        currentAttempt.key
      );

      // A confirmed response means the original attempt
      // is complete, whether new or replayed.
      sessionStorage.removeItem(storageKey(customerId));
      setAttempt(null);
      setConfirmation(result);

      // Do not erase a different cart assembled while
      // the previous checkout was unresolved.
      if (
        fingerprint(snapshotCart(cart)) ===
        fingerprint(currentAttempt.items)
      ) {
        clearCart();
      }
    } catch (err) {
      if (err.status === 0 || err.status === 409) {
        setError(
          "Your order's status is not confirmed yet. " +
          "Retry to check the same checkout attempt. " +
          "This will not intentionally create a new order."
        );
      } else {
        setError(
          err.message || "Unable to complete checkout."
        );
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <section className="checkout-page">
        <div className="checkout-confirmation">
          <div
            className="checkout-confirmation-icon"
            aria-hidden="true"
          >
            ✓
          </div>

          <p className="checkout-eyebrow">
            BULLDOG EXCHANGE
          </p>

          <h1>Order Confirmed!</h1>

          <p className="checkout-confirmation-message">
            Your order has been placed successfully.
          </p>

          <div className="checkout-confirmation-details">
            <div>
              <span>Order ID</span>
              <strong>{confirmation.order_id}</strong>
            </div>

            <div>
              <span>Payment Method</span>
              <strong>Cash on Delivery</strong>
            </div>

            <div className="checkout-confirmation-total">
              <span>Total Paid on Delivery</span>
              <strong>
                ₱{formatPrice(confirmation.total_price)}
              </strong>
            </div>
          </div>

          <Link
            className="checkout-confirmation-button"
            to="/shop"
          >
            Continue Shopping
          </Link>
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="checkout-page">
        <h1>Checkout</h1>
        <p>Please sign in before placing your order.</p>
        <Link to="/login">Sign In</Link>
        <p>Your cart items will remain saved.</p>
      </section>
    );
  }

  if (cart.length === 0 && !activeAttempt && !storageError) {
    return (
      <section className="checkout-page">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link to="/shop">Continue Shopping</Link>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <Link to="/cart">← Back to Cart</Link>

      <h1>Review Your Order</h1>

      {activeAttempt ? (
        <div className="checkout-recovery" role="status">
          <strong>Checkout awaiting confirmation</strong>
          <p>
            An earlier checkout attempt is still
            unresolved. Use the button below to retry
            that exact order.
          </p>
          {cartChanged && (
            <p>
              Your cart has changed since that attempt.
              Retrying will use the original items,
              not your current cart.
            </p>
          )}
        </div>
      ) : (
        <p>
          Review your {cartCount} item(s) before placing
          your order.
        </p>
      )}

      {cart.length > 0 && (
        <div className="checkout-items">
          {cart.map((item) => (
            <article
              key={item.cartKey}
              className="checkout-item"
            >
              <h2>{item.name}</h2>

              {item.size && <p>Size: {item.size}</p>}

              <p>Quantity: {item.quantity}</p>

              <p>
                Unit Price: ₱{formatPrice(item.price)}
              </p>

              <p>
                Subtotal: ₱
                {formatPrice(item.price * item.quantity)}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="checkout-summary">
        <h2>Order Summary</h2>

        <p>Items in current cart: {cartCount}</p>
        <p>Payment Method: Cash on Delivery</p>

        <p>
          <strong>
            Current Cart Total: ₱{formatPrice(cartTotal)}
          </strong>
        </p>

        <p>
          {activeAttempt
            ? "The pending order uses its saved items. " +
              "The server will confirm its final total."
            : "Final pricing and availability will be " +
              "verified by the server."}
        </p>

        {(error || storageError) && (
          <p role="alert" className="checkout-error">
            {error || storageError}
          </p>
        )}

        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={isSubmitting || Boolean(storageError)}
        >
          {isSubmitting
            ? "Processing..."
            : activeAttempt
              ? "Retry Pending Checkout"
              : "Place Order"}
        </button>
      </div>
    </section>
  );
}

export default Checkout;
