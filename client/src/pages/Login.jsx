
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser } from "../services/auth";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const data = await loginUser(
        email.trim(),
        password
    );

      if (!data.token || !data.user) {
        throw new Error("Invalid login response.");
      }

      // Temporary session storage for this development stage.
      // A centralized authentication context will follow.
      sessionStorage.setItem(
        "bulldog-exchange-token",
        data.token
      );

      sessionStorage.setItem(
        "bulldog-exchange-user",
        JSON.stringify(data.user)
      );

      setPassword("");

      // Administrators and customers will eventually have
      // different destinations after authentication.
      if (data.user.role === "admin") {
        navigate("/", { replace: true });
      } else {
        navigate("/shop", { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-heading">
          <h1>WELCOME BACK</h1>
          <p>Sign in to your account</p>
        </div>

        <form
          className="login-form"
          onSubmit={handleSubmit}
        >
          <div className="login-field">
            <label htmlFor="login-email">
              Email
            </label>

            <input
              id="login-email"
              type="email"
              placeholder="you@nu.edu.ph"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">
              Password
            </label>

            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              disabled={loading}
            />
          </div>

          {error && (
            <p
              className="login-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-submit-button"
            disabled={loading}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <p className="login-signup-link">
            Don't have an account?{" "}
            <Link to="/register">Sign Up</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default Login;
