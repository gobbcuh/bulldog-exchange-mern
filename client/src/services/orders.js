
export async function createOrder(request, cart, idempotencyKey) {
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
      payment_method: "cod",
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
