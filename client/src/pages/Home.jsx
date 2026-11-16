
import { useEffect, useState } from "react";
import { fetchProducts } from "../services/products";
import "./Home.css";
import ProductCard from "../components/ProductCard";

function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await fetchProducts();
        setProducts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  return (
    <>
      <section className="home-hero">
        <img
          className="home-hero-image"
          src="/assets/hero-banner.jpg"
          alt="National University merchandise"
        />

        <div className="home-hero-overlay" />

        <div className="home-hero-container">
          <div className="home-hero-content">
            <p className="home-hero-eyebrow">
              BULLDOG EXCHANGE
            </p>

            <h1 className="home-hero-title">
              OFFICIAL NU
              <span>MERCHANDISE STORE</span>
            </h1>

            <p className="home-hero-description">
              — Shop premium university merch
            </p>

            <a className="home-hero-button" href="/shop">
              Shop Now <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <section className="new-items">
        <div className="new-items-heading">
          <h2>New Items</h2>
          <a href="/shop">View All →</a>
        </div>

        {loading && <p>Loading products...</p>}

        {error && (
          <p role="alert">Unable to load products: {error}</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p>No products available yet.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="new-items-grid">
          {products.slice(0, 4).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
            />
          ))}
        </div>
        )}
      </section>
    </>
  );
}

export default Home;
