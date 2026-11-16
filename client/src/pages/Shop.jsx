
import { useEffect, useMemo, useState } from "react";
import { fetchProducts } from "../services/products";
import ProductCard from "../components/ProductCard";
import "./Shop.css";

const categories = [
  "All",
  "Uniforms",
  "T-Shirts",
  "Hoodies",
  "Jackets",
  "Bottoms",
  "Bags",
  "Accessories",
];

function Shop() {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("default");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        const data = await fetchProducts();

        if (active) {
          setProducts(data);
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

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const result =
      category === "All"
        ? [...products]
        : products.filter(
            (product) => product.category === category
          );

    if (sort === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    }

    if (sort === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    }

    return result;
  }, [products, category, sort]);

  return (
    <div className="shop-page">
      <header className="shop-header">
        <div className="shop-container">
          <h1>
            Shop <span>{category}</span>
          </h1>
          <p>
            {filteredProducts.length}{" "}
            {filteredProducts.length === 1
              ? "product"
              : "products"}{" "}
            available
          </p>
        </div>
      </header>

      <section className="shop-container shop-content">
        <div className="shop-filters">
          <div
            className="shop-categories"
            aria-label="Product categories"
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  category === item
                    ? "shop-category active"
                    : "shop-category"
                }
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="shop-toolbar">
            <label htmlFor="shop-sort">
              Filters:
            </label>

            <select
              id="shop-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value)
              }
            >
              <option value="default">
                Sort by: Default
              </option>
              <option value="price-asc">
                Price: Low → High
              </option>
              <option value="price-desc">
                Price: High → Low
              </option>
            </select>

            <span className="shop-showing-count">
              Showing {filteredProducts.length}{" "}
              {filteredProducts.length === 1
                ? "item"
                : "items"}
            </span>
          </div>
        </div>

        {loading && <p>Loading products...</p>}

        {error && (
          <p role="alert">
            Unable to load products: {error}
          </p>
        )}

        {!loading &&
          !error &&
          filteredProducts.length === 0 && (
            <div className="shop-empty">
              <h2>No products found</h2>
              <p>
                Try selecting a different category.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          filteredProducts.length > 0 && (
            <div className="shop-grid">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          )}
      </section>
    </div>
  );
}

export default Shop;
