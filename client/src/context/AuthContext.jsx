import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
  } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "bulldog-exchange-token";
const USER_KEY = "bulldog-exchange-user";

function getTokenExpiration(token) {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const payloadPart = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const payload = JSON.parse(atob(payloadPart));

    if (
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }

    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const expiresAt = getTokenExpiration(token);

  return expiresAt === null || Date.now() >= expiresAt;
}

function clearStoredSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function loadSession() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const savedUser = sessionStorage.getItem(USER_KEY);

    if (!token || !savedUser) {
      clearStoredSession();
      return null;
    }

    if (isTokenExpired(token)) {
      clearStoredSession();
      return null;
    }

    const user = JSON.parse(savedUser);

    if (
      !user ||
      typeof user.id !== "string" ||
      !["user", "admin"].includes(user.role)
    ) {
      clearStoredSession();
      return null;
    }

    return { token, user };
  } catch {
    clearStoredSession();
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  function signIn(token, user) {
    if (
      typeof token !== "string" ||
      !token ||
      isTokenExpired(token) ||
      !user ||
      typeof user.id !== "string" ||
      !["user", "admin"].includes(user.role)
    ) {
      throw new Error("Invalid authentication session.");
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(
      USER_KEY,
      JSON.stringify(user)
    );

    setSession({ token, user });
  }

  function signOut() {
    clearStoredSession();
    setSession(null);
  }

  
  
const handleUnauthorized = useCallback((rejectedToken) => {
  if (
    typeof rejectedToken !== "string" ||
    !rejectedToken
  ) {
    return;
  }

  setSession((current) => {
    if (current?.token !== rejectedToken) {
      return current;
    }

    clearStoredSession();
    return null;
  });
}, []);  

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    const expiresAt = getTokenExpiration(session.token);

    if (expiresAt === null || expiresAt <= Date.now()) {
      clearStoredSession();
      // Schedule the state update outside the effect body.
      const timeoutId = window.setTimeout(() => {
        setSession((current) =>
          current?.token === session.token ? null : current
        );
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const remainingMs = expiresAt - Date.now();

    const timeoutId = window.setTimeout(() => {
      // Avoid clearing a newer session if the user signed in again.
      setSession((current) => {
        if (current?.token !== session.token) {
          return current;
        }

        clearStoredSession();
        return null;
      });
    }, Math.min(remainingMs, 2_147_483_647));

    return () => window.clearTimeout(timeoutId);
  }, [session]);

  const user = session?.user ?? null;
  const token = session?.token ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        isAdmin: user?.role === "admin",
        signIn,
        signOut,
        handleUnauthorized,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}
