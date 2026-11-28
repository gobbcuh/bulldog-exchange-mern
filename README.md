# Bulldog Exchange

Bulldog Exchange is a campus merchandise storefront built with React and Vite, an Express API, and MongoDB. Customers can browse products, manage a cart, request pickup or delivery, and pay by cash or PayMongo. Administrators can manage products, delivery quotes, and order progress.

## Project structure

- `client/` — React single-page app, served locally by Vite.
- `server/` — Express API, MongoDB models, and database scripts.
- `shared/` — Data shared by the client and API, including the approved campus choices.

## Requirements

- Node.js 20.19+ or 22.12+ (or a newer compatible release) and npm.
- MongoDB, either a MongoDB Atlas deployment or a local replica-set deployment. Checkout uses MongoDB transactions, which require a replica set.

## Local setup

### 1. Configure the API

In a terminal, from the project root:

```powershell
cd server
Copy-Item .env.example .env
```

Edit `server/.env` and set:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string. Use a replica-set-enabled database for checkout. |
| `JWT_SECRET` | Yes | A private, random secret used to sign login tokens. |
| `CLIENT_URL` | Yes | Exact client origin allowed by CORS; use `http://localhost:5173` locally. Production client origins must use HTTPS. |
| `PAYMONGO_SECRET_KEY` | For PayMongo | PayMongo secret key. Use a test key until test checkout and webhook flows have been verified. |
| `PAYMONGO_WEBHOOK_SECRET` | For PayMongo | Secret for the PayMongo webhook configured to call `/api/webhooks/paymongo`. Online checkout is disabled unless this is configured. |
| `PAYMONGO_PAYMENT_METHOD_TYPES` | No | Comma-separated PayMongo methods; defaults to `card,gcash,qrph`. Confirm availability for the merchant account. |
| `PORT` | No | API port; defaults to `5000`. |
| `ADMIN_EMAIL` | Only for admin setup | Email for the administrator created by the script below. |
| `ADMIN_PASSWORD` | Only for admin setup | Administrator password; must be 12–128 characters. |

Generate a secret rather than using the example placeholder:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not commit `.env` or share its values. For local MongoDB, configure a replica set and initiate it before placing orders; MongoDB Atlas deployments support transactions when configured appropriately. A typical local URI is `mongodb://127.0.0.1:27017/bulldog_exchange?replicaSet=rs0`, but the local MongoDB server must actually be running as replica set `rs0`.

Install dependencies and start the API:

```powershell
npm ci
npm run dev
```

The API starts at `http://localhost:5000` by default. Check it at `http://localhost:5000/api/health`.

### 2. Configure and run the client

Open a second terminal at the project root:

```powershell
cd client
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Keep `CLIENT_URL` in the server configuration aligned with that origin if Vite uses a different port.

The client uses `http://localhost:5000/api` by default in development. To override it, copy `client/.env.example` to `client/.env` and set `VITE_API_BASE_URL` to the complete API base URL, including `/api`. This setting is used by public and authenticated requests.

## Sample data and administrator account

Run these commands from `server/` after configuring `.env` and starting/connecting to MongoDB:

```powershell
node scripts/seedProducts.js
```

This inserts sample merchandise if it is not already present; running it again does not duplicate those products. The script refuses to run when `NODE_ENV=production`. Do not treat sample products, prices, imagery, or stock as approved catalog data. Before launch, replace them with verified products and inventory, and confirm written permission for NU names, logos, and other branding.

To create an administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`, then run:

```powershell
node scripts/createAdmin.js
```

The script creates one admin account and will not overwrite an existing account with that email. Regular registration always creates a customer account, not an administrator. Registration is limited to `@nu.edu.ph` email addresses and approved campus values.

## Main functionality

- Browse products and view product details.
- Store cart items in the browser's local storage.
- Sign in with an API-issued token.
- Request free pickup at NU Manila or delivery in Manila, Laguna, Cebu, or Davao.
- Place cash-on-delivery orders or pay online with PayMongo. Delivery is quote-first: the admin enters a fee, contacts the customer, and the customer approves or declines before stock is reserved.
- Administer products, customer fulfillment details, delivery quotes, and order progress.

## Payments and fulfillment

Pickup is currently offered at NU Manila. Delivery is limited to the four areas listed at checkout and requires a manually prepared quote; the app does not calculate carrier rates. Do not promise delivery costs, timelines, or coverage beyond what the store can actually fulfill.

For PayMongo, configure test credentials first and register the public HTTPS webhook URL `https://<API-host>/api/webhooks/paymongo` for `checkout_session.payment.paid`. Set the matching webhook signing secret and verify a successful test payment is reflected on the customer's order before enabling live credentials. Keep all PayMongo secrets on the server; never use `VITE_` variables for secrets. Do not use live payment credentials until merchant onboarding, refunds, customer support, order cancellation, and payment reconciliation procedures are in place. Refund processing is not automated by this application.

## Production deployment

Choose and configure the hosting providers for the client, API, and MongoDB separately. Use an Atlas deployment that supports MongoDB transactions, separate production secrets from local/test values, and require HTTPS for the storefront, API, and PayMongo webhook. Set server `CLIENT_URL` to the exact deployed HTTPS client origin and build the client with `VITE_API_BASE_URL` set to the HTTPS API URL ending in `/api` (or `/api` if client and API share an origin). Production builds fail rather than falling back to localhost when the API URL is missing or insecure. Configure the frontend host to serve `index.html` for unknown SPA paths (such as `/register`, `/orders`, and `/checkout`) while leaving API requests routed to the API host. Configure production CORS, domain/DNS, backups, monitoring, and secret rotation at the chosen providers; no provider-specific deployment configuration is included yet.

Before public launch, publish the actual fulfillment, delivery fee, payment, cancellation, refund, privacy, and support policies. The current delivery fee is entered manually by an admin; ask the user to provide the real delivery pricing and coverage rather than assuming them.

## Automated checks

The server integration suite uses Node's built-in test runner and a dedicated MongoDB replica-set test database. It drops that database before and after the test run; never point `MONGO_TEST_URI` at development or production data.

```powershell
cd server
$env:MONGO_TEST_URI = "mongodb://127.0.0.1:27017/bulldog_exchange_test?replicaSet=rs0"
npm test
```

GitHub Actions starts a MongoDB replica set, runs the server integration suite, then runs the client lint and production build on pushes and pull requests.

## API overview

All endpoints are under `/api`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | API health check. |
| `POST` | `/register` | Public | Create a customer account. |
| `POST` | `/login` | Public | Sign in and receive a token. |
| `GET` | `/products` | Public | List products. |
| `GET` | `/products/:id` | Public | Get product details. |
| `POST` | `/products` | Admin | Create a product. |
| `PUT` | `/products/:id` | Admin | Update a product. |
| `DELETE` | `/products/:id` | Admin | Delete a product. |
| `POST` | `/orders` | Signed-in customer | Create a pickup order or delivery quote request. |
| `POST` | `/orders/:id/paymongo-checkout` | Order owner | Start or resume PayMongo checkout. |
| `GET` | `/orders/my` | Signed-in customer | List the signed-in customer's orders. |
| `PUT` | `/orders/:id/shipping-quote` | Admin | Add a delivery quote. |
| `POST` | `/orders/:id/accept-quote` | Order owner | Accept a delivery quote and reserve inventory. |
| `POST` | `/orders/:id/reject-quote` | Order owner | Decline a delivery quote. |
| `GET` | `/orders/:id` | Owner or admin | Get an order. |
| `GET` | `/orders` | Admin | List recent orders. |
| `PUT` | `/orders/:id` | Admin | Advance or cancel an order. |
| `POST` | `/webhooks/paymongo` | PayMongo | Receive signed payment notifications. |

Admin and customer endpoints require a bearer token. Order creation also requires a valid `Idempotency-Key` header; the client generates and reuses this key when retrying a checkout.

## Useful commands

Run in `client/`:

```powershell
npm run dev
npm run lint
npm run build
npm run preview
```

Run in `server/`:

```powershell
npm run dev
npm start
npm test
```
