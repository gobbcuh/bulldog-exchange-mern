import { API_BASE_URL, authenticatedFetch } from "./api";

export async function fetchProducts() {
  const response = await fetch(`${API_BASE_URL}/products`);

  if (!response.ok) {
    throw new Error("Failed to load products");
  }

  return response.json();
}

export async function fetchProductById(id) {
  const response = await fetch(
    `${API_BASE_URL}/products/${encodeURIComponent(id)}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Product not found");
    }

    throw new Error("Failed to load product");
  }

  return response.json();
}

export async function createAdminProduct(token, data) {
  return authenticatedFetch("/products", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAdminProduct(token, id, data) {
  return authenticatedFetch(
    `/products/${encodeURIComponent(id)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteAdminProduct(token, id) {
  return authenticatedFetch(
    `/products/${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}

