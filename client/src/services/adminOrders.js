
import { authenticatedFetch } from "./api";

export function fetchAdminOrders(token) {
  return authenticatedFetch("/orders", token);
}

export function updateAdminOrderStatus(token, id, status) {
  return authenticatedFetch(
    `/orders/${encodeURIComponent(id)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    }
  );
}

export function setAdminDeliveryQuote(token, id, shippingFee) {
  return authenticatedFetch(
    `/orders/${encodeURIComponent(id)}/shipping-quote`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ shipping_fee: shippingFee }),
    }
  );
}
