
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Navbar.css";

function Navbar() {
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();

  const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() || "D";

  function handleLogout() {
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="site-header">
      <nav className="navbar">
        <Link className="navbar-brand" to="/">
          <span>BULLDOG</span>EXCHANGE
        </Link>

        <div className="navbar-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
          >
            HOME
          </NavLink>

          <NavLink
            to="/shop"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
          >
            SHOP
          </NavLink>

          <NavLink
            to="/about"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
          >
            ABOUT
          </NavLink>

          <Link
            className="cart-link"
            to="/cart"
            aria-label="Shopping cart"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
            </svg>
          </Link>

          {isAuthenticated ? (
            <div className="navbar-account">
              <Link to="/orders">MY ORDERS</Link>
              <span
                className="profile-avatar"
                title={user?.name || "Signed-in user"}
                aria-label={`Signed in as ${user?.name || "user"}`}
              >
                {initial}
              </span>

              <button
                type="button"
                className="navbar-logout"
                onClick={handleLogout}
              >
                LOGOUT
              </button>
            </div>
          ) : (
            <Link
              className="profile-avatar"
              to="/login"
              aria-label="Login"
            >
              D
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
