
export async function createOrder(
  request,
  cart,
  idempotencyKey,
  fulfillment,
  paymentMethod
) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Your cart is empty.");
  }

  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    throw new Error("Missing checkout attempt identifier.");
  }

  const items = cart.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    ...(item.size ? { size: item.size } : {}),
  }));

  const result = await request("/orders", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      items,
      fulfillment,
      payment_method: paymentMethod,
    }),
  });

  if (
    result?.success !== true ||
    typeof result.order_id !== "string" ||
    typeof result.total_price !== "number"
  ) {
    throw new Error("The server returned an invalid order confirmation.");
  }

  return result;
}

export async function createPaymongoCheckout(request, orderId) {
  const result = await request(
    `/orders/${encodeURIComponent(orderId)}/paymongo-checkout`,
    { method: "POST" }
  );

  if (
    result?.success !== true ||
    typeof result.checkout_url !== "string" ||
    !result.checkout_url.startsWith("https://")
  ) {
    throw new Error("The server returned an invalid payment link.");
  }

  return result.checkout_url;
}

export async function fetchMyOrders(request) {
  const result = await request("/orders/my");

  if (!Array.isArray(result)) {
    throw new Error("The server returned an invalid order list.");
  }

  return result;
}

export async function respondToDeliveryQuote(
  request,
  orderId,
  decision
) {
  if (!["accept", "reject"].includes(decision)) {
    throw new Error("Invalid delivery quote decision.");
  }

  const result = await request(
    `/orders/${encodeURIComponent(orderId)}/${decision}-quote`,
    { method: "POST" }
  );

  if (result?.success !== true || !result.order) {
    throw new Error("The delivery quote update was not confirmed.");
  }

  return result;
}
