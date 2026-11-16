
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchProducts } from "../services/products";
import { fetchAdminOrders } from "../services/adminOrders";
import "./AdminDashboard.css";

const peso = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

function AdminDashboard() {
  const { token, handleUnauthorized } = useAuth();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchProducts(),
      fetchAdminOrders(token),
    ])
      .then(([productData, orderData]) => {
        if (!active) return;
        setProducts(productData);
        setOrders(orderData);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) {
          handleUnauthorized(token);
        }
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, handleUnauthorized]);

  const lowStock = products.filter(
    (product) => product.stock <= 5
  );

  const recentOrderValue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce(
      (sum, order) => sum + Number(order.total_price || 0),
      0
    );

  return (
    <section className="admin-dashboard">
      <p className="admin-dashboard-eyebrow">
        BULLDOG EXCHANGE / ADMIN
      </p>
      <h1>Dashboard</h1>
      <p className="admin-dashboard-description">
        Overview of merchandise and recent orders.
      </p>

      {error && <p role="alert">{error}</p>}
      {loading && <p>Loading dashboard...</p>}

      {!loading && !error && (
        <>
          <div className="admin-stats">
            <article>
              <span>Total Products</span>
              <strong>{products.length}</strong>
            </article>

            <article>
              <span>Recent Orders</span>
              <strong>{orders.length}</strong>
            </article>

            <article>
              <span>Low Stock (5 or fewer)</span>
              <strong>{lowStock.length}</strong>
            </article>

            <article>
              <span>Recent Order Value</span>
              <strong>{peso(recentOrderValue)}</strong>
            </article>
          </div>

          <p className="admin-dashboard-note">
            Order figures cover up to the 100 most recent
            orders. Order value excludes cancelled orders
            and is not confirmed revenue.
          </p>

          <div className="admin-dashboard-sections">
            <article>
              <div className="admin-section-heading">
                <h2>Recent Orders</h2>
                <Link to="/admin/orders">View All</Link>
              </div>

              {orders.slice(0, 5).map((order) => (
                <div className="admin-summary-row" key={order.id ?? order._id}>
                  <div>
                  <strong>
                    #{String(order.id ?? order._id ?? "UNKNOWN")
                    .slice(-8)
                    .toUpperCase()}
                  </strong>
                    <span>{order.status}</span>
                  </div>
                  <strong>{peso(order.total_price)}</strong>
                </div>
              ))}

              {orders.length === 0 && <p>No orders yet.</p>}
            </article>

            <article>
              <div className="admin-section-heading">
                <h2>Low Stock Products</h2>
                <Link to="/admin/products">Manage</Link>
              </div>

              {lowStock.map((product) => (
                <div className="admin-summary-row" key={product.id}>
                  <strong>{product.name}</strong>
                  <span>{product.stock} left</span>
                </div>
              ))}

              {lowStock.length === 0 && (
                <p>No low-stock products.</p>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}

export default AdminDashboard;
