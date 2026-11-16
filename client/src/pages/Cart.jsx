
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { fetchProductById } from "../services/products";
import "./Cart.css";

const formatPrice = (value) =>
  Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

function Cart() {
  const {
    cart,
    cartCount,
    cartTotal,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const [showClearConfirmation, setShowClearConfirmation] =
    useState(false);

  const [stockByProduct, setStockByProduct] = useState({});
  const [stockLoading, setStockLoading] = useState(true);
  const [stockErrors, setStockErrors] = useState({});
  const [quantityErrors, setQuantityErrors] = useState({});
  const [updatingProductId, setUpdatingProductId] =
    useState(null);

  const productIds = [
    ...new Set(cart.map((item) => item.productId)),
  ];

  const productIdsKey = productIds.slice().sort().join(",");

  useEffect(() => {
    let active = true;

    async function loadStock() {
      if (!productIdsKey) {
        setStockByProduct({});
        setStockErrors({});
        setStockLoading(false);
        return;
      }

      setStockLoading(true);

      const ids = productIdsKey.split(",");

      const results = await Promise.all(
        ids.map(async (productId) => {
          try {
            const product = await fetchProductById(
              productId
            );

            return {
              productId,
              stock: Number(product.stock),
              error: "",
            };
          } catch (error) {
            return {
              productId,
              stock: null,
              error:
                error.message ||
                "Could not check product stock.",
            };
          }
        })
      );

      if (!active) {
        return;
      }

      const nextStock = {};
      const nextErrors = {};

      for (const result of results) {
        if (
          Number.isInteger(result.stock) &&
          result.stock >= 0
        ) {
          nextStock[result.productId] = result.stock;
        } else {
          nextErrors[result.productId] =
            result.error || "Stock is unavailable.";
        }
      }

      setStockByProduct(nextStock);
      setStockErrors(nextErrors);
      setStockLoading(false);
    }

    loadStock();

    return () => {
      active = false;
    };
  }, [productIdsKey]);

  function handleClearCart() {
    clearCart();
    setQuantityErrors({});
    setShowClearConfirmation(false);
  }

  function handleRemoveItem(cartKey) {
    removeFromCart(cartKey);

    setQuantityErrors((current) => {
      const next = { ...current };
      delete next[cartKey];
      return next;
    });
  }

  async function handleQuantityChange(item, change) {
    if (updatingProductId || stockLoading) {
      return;
    }

    const newQuantity = item.quantity + change;

    if (newQuantity < 1) {
      return;
    }

    setUpdatingProductId(item.productId);

    setQuantityErrors((current) => ({
      ...current,
      [item.cartKey]: "",
    }));

    try {
      // Recheck stock immediately before changing quantity.
      const product = await fetchProductById(
        item.productId
      );

      const stock = Number(product.stock);

      if (!Number.isInteger(stock) || stock < 0) {
        throw new Error("Product stock is unavailable.");
      }

      setStockByProduct((current) => ({
        ...current,
        [item.productId]: stock,
      }));

      setStockErrors((current) => {
        const next = { ...current };
        delete next[item.productId];
        return next;
      });

      const result = updateQuantity(
        item.cartKey,
        newQuantity,
        stock
      );

      if (!result.success) {
        setQuantityErrors((current) => ({
          ...current,
          [item.cartKey]: result.message,
        }));
      }
    } catch (error) {
      setQuantityErrors((current) => ({
        ...current,
        [item.cartKey]:
          error.message || "Could not update quantity.",
      }));
    } finally {
      setUpdatingProductId(null);
    }
  }

  return (
    <main className="cart-page">
      <div className="cart-container">
        <div className="cart-heading">
          <Link to="/shop" className="cart-back-link">
            ← Continue Shopping
          </Link>

          <h1>
            SHOPPING <span>CART</span>
          </h1>

          <p>
            {cartCount}{" "}
            {cartCount === 1 ? "item" : "items"} in your cart
          </p>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>

            <h2>Your cart is empty</h2>

            <p>
              Looks like you haven't added anything yet.
            </p>

            <Link
              to="/shop"
              className="cart-shop-button"
            >
              Explore Products →
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <section
              className="cart-items"
              aria-label="Cart items"
            >
              <div className="cart-section-heading">
                <h2>Your Items</h2>

                <button
                  type="button"
                  className="cart-clear-button"
                  onClick={() =>
                    setShowClearConfirmation(true)
                  }
                >
                  Clear Cart
                </button>
              </div>

              {cart.map((item) => {
                const stock =
                  stockByProduct[item.productId];

                const totalForProduct = cart
                  .filter(
                    (cartItem) =>
                      cartItem.productId ===
                      item.productId
                  )
                  .reduce(
                    (total, cartItem) =>
                      total + cartItem.quantity,
                    0
                  );

                const stockKnown =
                  Number.isInteger(stock);

                const isUpdating =
                  updatingProductId === item.productId;

                const cannotIncrease =
                  stockLoading ||
                  !stockKnown ||
                  Boolean(updatingProductId) ||
                  totalForProduct >= stock;

                return (
                  <article
                    key={item.cartKey}
                    className="cart-item"
                  >
                    <Link
                      to={`/products/${item.productId}`}
                      className="cart-item-image"
                      aria-label={`View ${item.name}`}
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                        />
                      ) : (
                        <div className="cart-image-placeholder">
                          <strong>BULLDOG</strong>
                          <span>EXCHANGE</span>
                        </div>
                      )}
                    </Link>

                    <div className="cart-item-details">
                      <Link
                        to={`/products/${item.productId}`}
                        className="cart-item-name"
                      >
                        {item.name}
                      </Link>

                      {item.size && (
                        <p className="cart-item-size">
                          Size:{" "}
                          <strong>{item.size}</strong>
                        </p>
                      )}

                      <p className="cart-item-unit-price">
                        ₱{formatPrice(item.price)} each
                      </p>

                      <div className="cart-quantity-section">
                        <span className="cart-quantity-label">
                          Quantity
                        </span>

                        <div className="cart-quantity-controls">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}, size ${item.size || "standard"}`}
                            onClick={() =>
                              handleQuantityChange(
                                item,
                                -1
                              )
                            }
                            disabled={
                              item.quantity <= 1 ||
                              Boolean(updatingProductId)
                            }
                          >
                            −
                          </button>

                          <span>{item.quantity}</span>

                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}, size ${item.size || "standard"}`}
                            onClick={() =>
                              handleQuantityChange(
                                item,
                                1
                              )
                            }
                            disabled={cannotIncrease}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {stockLoading && (
                        <p className="cart-stock-note">
                          Checking availability...
                        </p>
                      )}

                      {!stockLoading &&
                        stockKnown &&
                        totalForProduct > stock && (
                          <p
                            className="cart-quantity-error"
                            role="alert"
                          >
                            Your cart contains{" "}
                            {totalForProduct} units of
                            this product, but only{" "}
                            {stock} are currently
                            available.
                          </p>
                        )}

                      {stockErrors[item.productId] && (
                        <p
                          className="cart-quantity-error"
                          role="alert"
                        >
                          {stockErrors[item.productId]}
                        </p>
                      )}

                      {quantityErrors[item.cartKey] && (
                        <p
                          className="cart-quantity-error"
                          role="alert"
                        >
                          {quantityErrors[item.cartKey]}
                        </p>
                      )}

                      <button
                        type="button"
                        className="cart-remove-button"
                        onClick={() =>
                          handleRemoveItem(item.cartKey)
                        }
                        disabled={isUpdating}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="cart-item-subtotal">
                      ₱
                      {formatPrice(
                        Number(item.price) *
                          item.quantity
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="cart-summary">
              <h2>Order Summary</h2>

              <div className="cart-summary-row">
                <span>
                  Subtotal ({cartCount}{" "}
                  {cartCount === 1
                    ? "item"
                    : "items"})
                </span>

                <strong>
                  ₱{formatPrice(cartTotal)}
                </strong>
              </div>

              <div className="cart-summary-row">
                <span>Payment Method</span>
                <span>Cash on Delivery</span>
              </div>

              <div className="cart-summary-divider" />

              <div className="cart-summary-total">
                <span>Total</span>

                <strong>
                  ₱{formatPrice(cartTotal)}
                </strong>
              </div>

              <p className="cart-summary-note">
                Final pricing and availability will be
                confirmed at checkout.
              </p>

              <button
                type="button"
                className="cart-checkout-button"
                disabled
                title="Checkout will be connected next"
              >
                Proceed to Checkout →
              </button>

              <Link
                to="/shop"
                className="cart-continue-link"
              >
                Continue Shopping
              </Link>
            </aside>
          </div>
        )}

        {showClearConfirmation && (
          <div
            className="cart-modal-backdrop"
            onClick={() =>
              setShowClearConfirmation(false)
            }
          >
            <div
              className="cart-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-cart-title"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <h2 id="clear-cart-title">
                Clear your cart?
              </h2>

              <p>
                This will remove all items from your
                shopping cart.
              </p>

              <div className="cart-modal-actions">
                <button
                  type="button"
                  className="cart-modal-cancel"
                  onClick={() =>
                    setShowClearConfirmation(false)
                  }
                >
                  Keep Items
                </button>

                <button
                  type="button"
                  className="cart-modal-confirm"
                  onClick={handleClearCart}
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default Cart;
