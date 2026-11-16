
const API_BASE_URL = "http://localhost:5000/api";

async function adminOrderRequest(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.message || `Request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export function fetchAdminOrders(token) {
  return adminOrderRequest("/orders", token);
}

export function updateAdminOrderStatus(token, id, status) {
  return adminOrderRequest(
    `/orders/${encodeURIComponent(id)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    }
  );
}
