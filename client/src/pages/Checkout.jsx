
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useAuthenticatedApi } from "../hooks/useAuthenticatedApi";
import {
  createOrder,
  createPaymongoCheckout,
} from "../services/orders";
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

function snapshotFulfillment(method, phone, area, address) {
  return {
    method,
    phone: phone.trim(),
    pickup_location: method === "pickup" ? "nu manila" : null,
    delivery_area: method === "delivery" ? area : null,
    delivery_address:
      method === "delivery" ? address.trim() : null,
  };
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
      ) ||
      !attempt.fulfillment ||
      !["pickup", "delivery"].includes(
        attempt.fulfillment.method
      ) ||
      typeof attempt.fulfillment.phone !== "string" ||
      !["cod", "paymongo"].includes(attempt.paymentMethod)
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
  const [phone, setPhone] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState("pickup");
  const [deliveryArea, setDeliveryArea] = useState("manila");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");

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
          fulfillment: snapshotFulfillment(
            fulfillmentMethod,
            phone,
            deliveryArea,
            deliveryAddress
          ),
          paymentMethod,
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
        currentAttempt.key,
        currentAttempt.fulfillment,
        currentAttempt.paymentMethod
      );

      if (result.status === "pending_payment") {
        const checkoutUrl = await createPaymongoCheckout(
          request,
          result.order_id
        );

        sessionStorage.removeItem(storageKey(customerId));
        if (
          fingerprint(snapshotCart(cart)) ===
          fingerprint(currentAttempt.items)
        ) {
          clearCart();
        }

        window.location.assign(checkoutUrl);
        return;
      }

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

      setPhone("");
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
    const isQuoteRequest =
      confirmation.status === "quote_required";

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

          <h1>
            {isQuoteRequest
              ? "Delivery Request Submitted"
              : "Order Confirmed!"}
          </h1>

          <p className="checkout-confirmation-message">
            {isQuoteRequest
              ? "The store will contact you to confirm the delivery fee. Your order is not final until you approve the quote."
              : "Your order has been placed successfully."}
          </p>

          <div className="checkout-confirmation-details">
            <div>
              <span>Order ID</span>
              <strong>{confirmation.order_id}</strong>
            </div>

            <div>
              <span>Fulfillment</span>
              <strong>
                {confirmation.fulfillment_method === "delivery"
                  ? "Delivery quote requested"
                  : "Pickup at NU Manila"}
              </strong>
            </div>

            <div className="checkout-confirmation-total">
              <span>
                {isQuoteRequest
                  ? "Merchandise subtotal (delivery not included)"
                  : "Total"}
              </span>
              <strong>
                ₱{formatPrice(confirmation.total_price)}
              </strong>
            </div>
          </div>

          <Link
            className="checkout-confirmation-button"
            to="/orders"
          >
            View My Orders
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
          <p>
            Fulfillment: {activeAttempt.fulfillment.method}
            {" · "}
            Payment: {activeAttempt.paymentMethod}
          </p>
        </div>
      ) : (
        <p>
          Review your {cartCount} item(s) before placing
          your order.
        </p>
      )}

      <fieldset
        className="checkout-fulfillment-form"
        disabled={Boolean(activeAttempt) || isSubmitting}
      >
        <legend>Contact and fulfillment</legend>
        <label>
          Contact phone
          <input
            type="tel"
            autoComplete="tel"
            required
            minLength={7}
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+63 9XX XXX XXXX"
          />
        </label>

        <label>
          Receive your order
          <select
            value={fulfillmentMethod}
            onChange={(event) =>
              setFulfillmentMethod(event.target.value)
            }
          >
            <option value="pickup">Pickup at NU Manila</option>
            <option value="delivery">Delivery (quote required)</option>
          </select>
        </label>

        {fulfillmentMethod === "pickup" ? (
          <p>Pickup location: NU Manila. No delivery fee.</p>
        ) : (
          <>
            <label>
              Delivery area
              <select
                value={deliveryArea}
                onChange={(event) =>
                  setDeliveryArea(event.target.value)
                }
              >
                <option value="manila">Manila</option>
                <option value="laguna">Laguna</option>
                <option value="cebu">Cebu</option>
                <option value="davao">Davao</option>
              </select>
            </label>
            <label>
              Full delivery address
              <textarea
                required
                minLength={10}
                maxLength={500}
                rows={3}
                value={deliveryAddress}
                onChange={(event) =>
                  setDeliveryAddress(event.target.value)
                }
                placeholder="House/building, street, barangay, city, and postal code"
              />
            </label>
            <p>
              Delivery is a quote-first request. The store will contact
              you with the fee; you can approve or decline it in My Orders.
            </p>
          </>
        )}

        <label>
          Payment method
          <select
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value)
            }
          >
            <option value="cod">Cash on delivery / pickup</option>
            <option value="paymongo">Pay online with PayMongo</option>
          </select>
        </label>
        {paymentMethod === "paymongo" && (
          <p>
            Online payment starts after any delivery quote is accepted.
          </p>
        )}
      </fieldset>

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
        <p>
          <strong>
            Merchandise subtotal: ₱{formatPrice(cartTotal)}
          </strong>
        </p>
        {fulfillmentMethod === "delivery" && (
          <p>Delivery fee: quoted after you submit this request.</p>
        )}

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
              : fulfillmentMethod === "delivery"
                ? "Request Delivery Quote"
                : paymentMethod === "paymongo"
                  ? "Continue to PayMongo"
                  : "Place Pickup Order"}
        </button>
      </div>
    </section>
  );
}

export default Checkout;
