require("dotenv").config();

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const mongoTestUri = process.env.MONGO_TEST_URI;

if (!mongoTestUri) {
  throw new Error(
    "Set MONGO_TEST_URI to a dedicated MongoDB replica-set test database."
  );
}

const testDatabaseName = decodeURIComponent(
  new URL(mongoTestUri).pathname.replace(/^\//, "")
);

if (!/(^|[_-])test($|[_-])/i.test(testDatabaseName)) {
  throw new Error(
    "MONGO_TEST_URI must use a database name containing 'test'; the test suite drops that database."
  );
}

process.env.JWT_SECRET = "integration-test-secret-not-for-production";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.PAYMONGO_SECRET_KEY = "sk_test_integration";
process.env.PAYMONGO_WEBHOOK_SECRET = "integration-webhook-secret";

const app = require("../src/app");
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const User = require("../src/models/User");

let server;
let baseUrl;
let customerToken;
let adminToken;
let product;

async function request(path, { token, method = "GET", body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function createOrder({
  productId = product.id,
  quantity = 1,
  paymentMethod = "cod",
  fulfillment = {
    method: "pickup",
    phone: "09171234567",
    pickup_location: "nu manila",
  },
  key = crypto.randomUUID(),
} = {}) {
  return request("/orders", {
    method: "POST",
    token: customerToken,
    headers: { "Idempotency-Key": key },
    body: {
      items: [{ product_id: productId, quantity }],
      payment_method: paymentMethod,
      fulfillment,
    },
  });
}

before(async () => {
  await mongoose.connect(mongoTestUri, {
    serverSelectionTimeoutMS: 10000,
  });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Product.init(), Order.init()]);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }

  if (mongoose.connection.readyState) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("registration, authorization, orders, stock, and payments", async (t) => {
  await t.test("registration enforces NU email and approved campus", async () => {
    const invalidEmail = await request("/register", {
      method: "POST",
      body: {
        name: "Test User",
        email: "student@example.com",
        password: "A-long-test-password-1",
        campus: "nu manila",
      },
    });
    assert.equal(invalidEmail.status, 400);

    const invalidCampus = await request("/register", {
      method: "POST",
      body: {
        name: "Test User",
        email: "student@nu.edu.ph",
        password: "A-long-test-password-1",
        campus: "unapproved campus",
      },
    });
    assert.equal(invalidCampus.status, 400);

    const registration = await request("/register", {
      method: "POST",
      body: {
        name: "Test User",
        email: "student@NU.edu.ph",
        password: "A-long-test-password-1",
        campus: "NU Manila",
      },
    });
    assert.equal(registration.status, 201);

    const login = await request("/login", {
      method: "POST",
      body: {
        email: "STUDENT@nu.edu.ph",
        password: "A-long-test-password-1",
      },
    });
    assert.equal(login.status, 200);
    customerToken = login.body.token;
  });

  await t.test("admin authorization and product validation", async () => {
    const customerCreate = await request("/products", {
      method: "POST",
      token: customerToken,
      body: {
        name: "Unauthorized product",
        category: "Test",
        price: 100,
        stock: 1,
      },
    });
    assert.equal(customerCreate.status, 403);

    const admin = await User.create({
      name: "Test Admin",
      email: "admin@nu.edu.ph",
      passwordHash: await bcrypt.hash("Another-test-password-1", 4),
      campus: "nu manila",
      role: "admin",
    });
    assert.ok(admin);

    const login = await request("/login", {
      method: "POST",
      body: {
        email: "admin@nu.edu.ph",
        password: "Another-test-password-1",
      },
    });
    assert.equal(login.status, 200);
    adminToken = login.body.token;

    const invalidProduct = await request("/products", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Invalid product",
        category: "Test",
        price: 100,
        stock: -1,
      },
    });
    assert.equal(invalidProduct.status, 400);

    const createdProduct = await request("/products", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Test shirt",
        category: "Apparel",
        price: 100,
        stock: 5,
      },
    });
    assert.equal(createdProduct.status, 201);
    product = createdProduct.body.product;
  });

  await t.test("checkout retries are idempotent and cancellation restores stock", async () => {
    const key = crypto.randomUUID();
    const first = await createOrder({ key });
    const retry = await createOrder({ key });
    const conflictingRetry = await createOrder({
      key,
      quantity: 2,
    });

    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.order_id, first.body.order_id);
    assert.equal(conflictingRetry.status, 409);
    assert.equal((await Product.findById(product.id)).stock, 4);

    const cancelled = await request(
      `/orders/${first.body.order_id}`,
      {
        method: "PUT",
        token: adminToken,
        body: { status: "cancelled" },
      }
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.stock_reserved, false);
    assert.equal((await Product.findById(product.id)).stock, 5);
  });

  await t.test("concurrent checkouts cannot oversell the last item", async () => {
    await Product.updateOne({ _id: product.id }, { $set: { stock: 1 } });

    const results = await Promise.all([
      createOrder(),
      createOrder(),
    ]);

    assert.equal(
      results.filter((result) => result.status === 201).length,
      1
    );
    assert.equal(
      results.filter((result) => result.status === 409).length,
      1
    );
    assert.equal((await Product.findById(product.id)).stock, 0);

    const successfulOrder = results.find(
      (result) => result.status === 201
    );
    const cancelled = await request(
      `/orders/${successfulOrder.body.order_id}`,
      {
        method: "PUT",
        token: adminToken,
        body: { status: "cancelled" },
      }
    );
    assert.equal(cancelled.status, 200);
    assert.equal((await Product.findById(product.id)).stock, 1);
  });

  await t.test("delivery quotes reserve stock only after acceptance", async () => {
    const delivery = await createOrder({
      fulfillment: {
        method: "delivery",
        phone: "09171234567",
        delivery_area: "manila",
        delivery_address: "123 Sample Street, Manila",
      },
    });

    assert.equal(delivery.status, 201);
    assert.equal(delivery.body.status, "quote_required");
    assert.equal((await Product.findById(product.id)).stock, 1);

    const quote = await request(
      `/orders/${delivery.body.order_id}/shipping-quote`,
      {
        method: "PUT",
        token: adminToken,
        body: { shipping_fee: 25 },
      }
    );
    assert.equal(quote.status, 200);

    const accepted = await request(
      `/orders/${delivery.body.order_id}/accept-quote`,
      { method: "POST", token: customerToken }
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.order.total_price, 125);
    assert.equal((await Product.findById(product.id)).stock, 0);

    const cancelled = await request(
      `/orders/${delivery.body.order_id}`,
      {
        method: "PUT",
        token: adminToken,
        body: { status: "cancelled" },
      }
    );
    assert.equal(cancelled.status, 200);
    assert.equal((await Product.findById(product.id)).stock, 1);
  });

  await t.test("PayMongo checkout requires a valid signed paid webhook", async () => {
    const abandonedOrder = await createOrder({
      paymentMethod: "paymongo",
    });
    const abandonedCancellation = await request(
      `/orders/${abandonedOrder.body.order_id}`,
      {
        method: "PUT",
        token: adminToken,
        body: { status: "cancelled" },
      }
    );
    assert.equal(abandonedCancellation.status, 200);
    assert.equal(
      abandonedCancellation.body.order.payment_status,
      "failed"
    );

    const order = await createOrder({ paymentMethod: "paymongo" });
    assert.equal(order.status, 201);
    assert.equal(order.body.status, "pending_payment");

    const originalFetch = global.fetch;
    global.fetch = async (input, options) => {
      if (!String(input).startsWith("https://api.paymongo.com/")) {
        return originalFetch(input, options);
      }

      const requestBody = JSON.parse(options.body);
      assert.equal(
        requestBody.data.attributes.reference_number,
        order.body.order_id
      );

      return new Response(
        JSON.stringify({
          data: {
            id: "cs_test_integration",
            attributes: {
              checkout_url: "https://checkout.paymongo.com/test-session",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const checkout = await request(
        `/orders/${order.body.order_id}/paymongo-checkout`,
        { method: "POST", token: customerToken }
      );
      assert.equal(checkout.status, 200);
      assert.equal(
        checkout.body.checkout_url,
        "https://checkout.paymongo.com/test-session"
      );
    } finally {
      global.fetch = originalFetch;
    }

    const event = {
      data: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_test_integration",
          attributes: {
            reference_number: order.body.order_id,
            payments: [
              {
                attributes: {
                  status: "paid",
                  currency: "PHP",
                  amount: 10000,
                },
              },
            ],
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest("hex");

    const invalidWebhook = await fetch(
      `${baseUrl}/api/webhooks/paymongo`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Paymongo-Signature": `t=${timestamp},te=${"0".repeat(64)}`,
        },
        body: rawBody,
      }
    );
    assert.equal(invalidWebhook.status, 400);

    const webhook = await fetch(`${baseUrl}/api/webhooks/paymongo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Paymongo-Signature": `t=${timestamp},te=${signature}`,
      },
      body: rawBody,
    });
    assert.equal(webhook.status, 200);

    const paidOrder = await Order.findById(order.body.order_id);
    assert.equal(paidOrder.payment_status, "paid");
    assert.equal(paidOrder.status, "pending");
  });
});
