
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

export async function registerUser({ name, email, password, campus }) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
        campus,
      }),
    });
  } catch {
    throw new Error(
      "Cannot connect to the server. Please try again later."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an invalid response."
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || "Unable to create your account."
    );
  }

  if (
    !data.user ||
    typeof data.user.id !== "string" ||
    typeof data.user.email !== "string"
  ) {
    throw new Error(
      "The server returned incomplete registration information."
    );
  }

  return data.user;
}

export async function loginUser(email, password) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });
  } catch {
    throw new Error(
      "Cannot connect to the server. Please try again later."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an invalid response."
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || "Unable to sign in."
    );
  }

  if (
    typeof data.token !== "string" ||
    !data.token ||
    !data.user ||
    typeof data.user.id !== "string" ||
    !["user", "admin"].includes(data.user.role)
  ) {
    throw new Error(
      "The server returned incomplete login information."
    );
  }

  return {
    token: data.token,
    user: data.user,
  };
}
