
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  fetchProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
} from "../services/products";
import "./AdminProducts.css";

const emptyForm = {
  name: "",
  category: "",
  price: "",
  stock: "",
  image: "",
  description: "",
  has_sizes: false,
  sizes: "",
};

const formatPrice = (price) =>
  Number(price).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function AdminProducts() {
  const { token } = useAuth();

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    fetchProducts()
      .then((data) => {
        if (active) setProducts(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEditing(product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
      image: product.image || "",
      description: product.description || "",
      has_sizes: Boolean(product.has_sizes),
      sizes: (product.sizes || []).join(", "),
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const data = {
      name: form.name.trim(),
      category: form.category.trim(),
      price: Number(form.price),
      stock: Number(form.stock),
      image: form.image.trim(),
      description: form.description.trim(),
      has_sizes: form.has_sizes,
      sizes: form.has_sizes
        ? form.sizes
            .split(",")
            .map((size) => size.trim())
            .filter(Boolean)
        : [],
    };

    try {
      if (
        !data.name ||
        !data.category ||
        form.price.trim() === "" ||
        form.stock.trim() === "" ||
        !Number.isFinite(data.price) ||
        data.price < 0 ||
        !Number.isSafeInteger(data.stock) ||
        data.stock < 0 ||
        (data.has_sizes && data.sizes.length === 0)
      ) {
        throw new Error(
          "Please enter valid product details."
        );
      }

      const result = editingId
        ? await updateAdminProduct(token, editingId, data)
        : await createAdminProduct(token, data);

      if (!result?.success || !result.product) {
        throw new Error("Invalid product response.");
      }

      if (editingId) {
        setProducts((current) =>
          current.map((product) =>
            product.id === editingId
              ? result.product
              : product
          )
        );
      } else {
        setProducts((current) => [
          result.product,
          ...current,
        ]);
      }

      setNotice(result.message || "Product saved.");
      resetForm();
    } catch (err) {
      setError(err.message || "Unable to save product.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(product) {
    if (busy) return;

    const confirmed = window.confirm(
      `Delete "${product.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await deleteAdminProduct(
        token,
        product.id
      );

      if (!result?.success) {
        throw new Error("Deletion was not confirmed.");
      }

      setProducts((current) =>
        current.filter(
          (item) => item.id !== product.id
        )
      );

      if (editingId === product.id) resetForm();

      setNotice("Product deleted successfully.");
    } catch (err) {
      setError(err.message || "Unable to delete product.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-products-page">
      <div className="admin-products-container">
        <div className="admin-products-header">
          <div>
            <p className="admin-eyebrow">
              BULLDOG EXCHANGE / ADMIN
            </p>
            <h1>Product Management</h1>
            <p>
              Manage merchandise, pricing, and inventory.
            </p>
          </div>

          <Link to="/shop">View Storefront</Link>
        </div>

        {error && (
          <p className="admin-alert admin-alert-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="admin-alert admin-alert-success" role="status">
            {notice}
          </p>
        )}

        <div className="admin-products-layout">
          <form
            className="admin-product-panel"
            onSubmit={handleSubmit}
          >
            <h2>
              {editingId ? "Edit Product" : "Add Product"}
            </h2>

            <label>
              Product Name
              <input
                required
                maxLength={150}
                value={form.name}
                onChange={(e) =>
                  updateField("name", e.target.value)
                }
              />
            </label>

            <label>
              Category
              <input
                required
                value={form.category}
                onChange={(e) =>
                  updateField("category", e.target.value)
                }
                placeholder="e.g. Apparel"
              />
            </label>

            <div className="admin-form-row">
              <label>
                Price (₱)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    updateField("price", e.target.value)
                  }
                />
              </label>

              <label>
                Stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) =>
                    updateField("stock", e.target.value)
                  }
                />
              </label>
            </div>

            <label>
              Image URL
              <input
                type="url"
                value={form.image}
                onChange={(e) =>
                  updateField("image", e.target.value)
                }
                placeholder="https://example.com/image.jpg"
              />
            </label>

            <label>
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  updateField("description", e.target.value)
                }
              />
            </label>

            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.has_sizes}
                onChange={(e) =>
                  updateField("has_sizes", e.target.checked)
                }
              />
              Product has sizes
            </label>

            {form.has_sizes && (
              <label>
                Available Sizes
                <input
                  required
                  value={form.sizes}
                  onChange={(e) =>
                    updateField("sizes", e.target.value)
                  }
                  placeholder="S, M, L, XL"
                />
              </label>
            )}

            <div className="admin-form-actions">
              <button type="submit" disabled={busy}>
                {busy
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Product"}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={resetForm}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="admin-product-panel">
            <div className="admin-list-heading">
              <h2>Inventory</h2>
              <span>{products.length} products</span>
            </div>

            {loading ? (
              <p>Loading inventory...</p>
            ) : (
              <div className="admin-product-list">
                {products.map((product) => (
                  <article
                    className="admin-product-row"
                    key={product.id}
                  >
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.category}</p>
                      <p>
                        ₱{formatPrice(product.price)}
                        {" · "}
                        Stock: {product.stock}
                      </p>
                    </div>

                    <div className="admin-row-actions">
                      <button
                        type="button"
                        onClick={() => startEditing(product)}
                        disabled={busy}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="admin-delete-button"
                        onClick={() => handleDelete(product)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {products.length === 0 && (
                  <p>No products available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AdminProducts;
