
const configuredApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "");

const isRelativeApiUrl =
  configuredApiBaseUrl.startsWith("/") &&
  !configuredApiBaseUrl.startsWith("//");

if (
  !configuredApiBaseUrl ||
  configuredApiBaseUrl.startsWith("//") ||
  (import.meta.env.PROD &&
    !isRelativeApiUrl &&
    !configuredApiBaseUrl.startsWith("https://"))
) {
  throw new Error(
    "Set VITE_API_BASE_URL to an HTTPS API URL or a same-origin /api path before building for production."
  );
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function authenticatedFetch(
  endpoint,
  token,
  options = {}
) {
  if (typeof token !== "string" || !token) {
    throw new ApiError(
      "Please sign in to continue.",
      401
    );
  }

  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//")
  ) {
    throw new Error("Invalid API endpoint.");
  }

  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);

  if (options.body && !(options.body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        ...options,
        headers,
      }
    );
  } catch {
    throw new ApiError(
      "Cannot connect to the server. Please try again later.",
      0
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    if (response.ok && response.status === 204) {
      return null;
    }

    throw new ApiError(
      "The server returned an invalid response.",
      response.status
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(
        data?.message || "Your session is invalid or has expired.",
        401
      );
    }

    if (response.status === 403) {
      throw new ApiError(
        data?.message || "You do not have permission to perform this action.",
        403
      );
    }

    throw new ApiError(
      data?.message || "The request could not be completed.",
      response.status
    );
  }

  return data;
}