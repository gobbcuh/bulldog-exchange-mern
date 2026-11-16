
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProductById } from "../services/products";
import { useCart } from "../context/CartContext";
import "./ProductDetails.css";

function ProductDetails() {
  const { id } = useParams();
  const { addToCart, cartCount } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      setLoading(true);
      setError("");
      setProduct(null);
      setSelectedSize("");
      setQuantity(1);
      setCartMessage("");

      try {
        const data = await fetchProductById(id);

        if (active) {
          setProduct(data);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      active = false;
    };
  }, [id]);

  function handleSizeChange(size) {
    setSelectedSize(size);
    setCartMessage("");
  }

  function handleQuantityDecrease() {
    setQuantity((current) => Math.max(1, current - 1));
    setCartMessage("");
  }

  function handleQuantityIncrease() {
    if (!product) {
      return;
    }

    setQuantity((current) =>
      Math.min(product.stock, current + 1)
    );

    setCartMessage("");
  }

  
function handleAddToCart() {
  if (!product || product.stock <= 0) {
    return;
  }

  if (
    product.has_sizes &&
    product.sizes.length > 0 &&
    !selectedSize
  ) {
    setCartMessage("Please select a size first.");
    return;
  }

  const result = addToCart(
    product,
    quantity,
    selectedSize
  );

  setCartMessage(result.message);
}

  if (loading) {
    return (
      <p className="product-message">
        Loading product...
      </p>
    );
  }

  if (error || !product) {
    return (
      <p className="product-message" role="alert">
        {error || "Product not found"}
      </p>
    );
  }

  const outOfStock = product.stock <= 0;

  const availableSizes = Array.isArray(product.sizes)
    ? product.sizes
    : [];

  const needsSize =
    product.has_sizes && availableSizes.length > 0;

  return (
    <div className="product-details-page">
      <div className="product-details-container">
        <Link className="product-back-link" to="/shop">
          ← Back to Shop
        </Link>

        <div className="product-details-grid">
          <div className="product-details-image">
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
              />
            ) : (
              <div className="product-details-placeholder">
                <strong>BULLDOG EXCHANGE</strong>
                <span>No product image</span>
              </div>
            )}
          </div>

          <div className="product-details-info">
            <p className="product-details-category">
              {product.category}
            </p>

            <h1>{product.name}</h1>

            <p className="product-details-price">
              ₱
              {Number(product.price).toLocaleString(
                "en-PH"
              )}
            </p>

            <p className="product-details-description">
              {product.description ||
                "No description available."}
            </p>

            <p className="product-details-availability">
              {outOfStock
                ? "Out of stock"
                : `${product.stock} items available`}
            </p>

            {needsSize && (
              <div className="product-size-section">
                <h2>Select Size</h2>

                <div className="product-size-options">
                  {availableSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={
                        selectedSize === size
                          ? "product-size active"
                          : "product-size"
                      }
                      onClick={() =>
                        handleSizeChange(size)
                      }
                      aria-pressed={
                        selectedSize === size
                      }
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="product-quantity-section">
              <h2>Quantity</h2>

              <div className="product-quantity-controls">
                <button
                  type="button"
                  onClick={handleQuantityDecrease}
                  disabled={
                    quantity <= 1 || outOfStock
                  }
                  aria-label="Decrease quantity"
                >
                  −
                </button>

                <span>{quantity}</span>

                <button
                  type="button"
                  onClick={handleQuantityIncrease}
                  disabled={
                    quantity >= product.stock ||
                    outOfStock
                  }
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <button
              className="product-add-button"
              type="button"
              onClick={handleAddToCart}
              disabled={outOfStock}
            >
              {outOfStock
                ? "Out of Stock"
                : "Add to Cart"}
            </button>

            {cartMessage && (
              <p
                className="product-cart-note"
                role="status"
              >
                {cartMessage}
              </p>
            )}

            <p className="product-cart-note">
              Items in cart: {cartCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetails;
