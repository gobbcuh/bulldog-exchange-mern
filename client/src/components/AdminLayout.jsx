
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AdminLayout.css";

function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>BULLDOG</span> EXCHANGE
          <small>ADMINISTRATION</small>
        </div>

        <nav className="admin-navigation">
          <NavLink to="/admin" end>
            Dashboard
          </NavLink>
          <NavLink to="/admin/products">
            Products
          </NavLink>
          <NavLink to="/admin/orders">
            Orders
          </NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <p>{user?.name || "Administrator"}</p>
          <span>Admin account</span>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
