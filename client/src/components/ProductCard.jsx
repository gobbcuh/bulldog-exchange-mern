
import "./ProductCard.css";

function ProductCard({ product }) {
  const isOutOfStock =
    product.is_out_of_stock ?? product.stock <= 0;

  return (
    <article className="product-card">
      <a
        href={`/products/${product.id}`}
        className="product-card-image-link"
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="product-card-image"
            loading="lazy"
          />
        ) : (
          <div className="product-card-placeholder">
            <span>BULLDOG EXCHANGE</span>
            <p>No product image</p>
          </div>
        )}

        {isOutOfStock && (
          <span className="product-card-badge">
            Out of Stock
          </span>
        )}
      </a>

      <div className="product-card-content">
        <p className="product-card-category">
          {product.category}
        </p>

        <h3 className="product-card-name">
          <a href={`/products/${product.id}`}>
            {product.name}
          </a>
        </h3>

        <div className="product-card-bottom">
          <span className="product-card-price">
            ₱{Number(product.price).toLocaleString("en-PH")}
          </span>

          <span className="product-card-stock">
            {isOutOfStock
              ? "Unavailable"
              : `${product.stock} available`}
          </span>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
