
const API_BASE_URL = "http://localhost:5000/api";

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

