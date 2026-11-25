# Bulldog Exchange

Bulldog Exchange is a campus merchandise storefront built with React and Vite, an Express API, and MongoDB. Customers can browse products, manage a cart, and place cash-on-delivery orders. Administrators can manage products and order statuses.

## Project structure

- `client/` — React single-page app, served locally by Vite.
- `server/` — Express API, MongoDB models, and database scripts.

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
| `CLIENT_URL` | Yes | Exact client origin allowed by CORS; use `http://localhost:5173` for the default Vite server. |
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

The client uses `http://localhost:5000/api` by default. `VITE_API_BASE_URL` can override the URL used by authentication and authenticated API requests; public product requests currently use a fixed `http://localhost:5000/api` URL in `client/src/services/products.js`.

## Sample data and administrator account

Run these commands from `server/` after configuring `.env` and starting/connecting to MongoDB:

```powershell
node scripts/seedProducts.js
```

This inserts the sample merchandise if it is not already present; running it again does not duplicate those products.

To create an administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env`, then run:

```powershell
node scripts/createAdmin.js
```

The script creates one admin account and will not overwrite an existing account with that email. Regular registration always creates a customer account, not an administrator. The API has a registration endpoint (`POST /api/register`), but the current client does not yet include a registration page; the “Sign Up” link points to `/register`, which is not currently routed.

## Main functionality

- Browse products and view product details.
- Store cart items in the browser's local storage.
- Sign in with an API-issued token.
- Place cash-on-delivery orders; the server validates current prices and stock and updates inventory.
- Administer products and order progress from the admin pages.

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
| `POST` | `/orders` | Signed-in customer | Place a cash-on-delivery order. |
| `GET` | `/orders/my` | Signed-in customer | List the signed-in customer's orders. |
| `GET` | `/orders/:id` | Owner or admin | Get an order. |
| `GET` | `/orders` | Admin | List recent orders. |
| `PUT` | `/orders/:id` | Admin | Advance or cancel an order. |

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
```

The repository does not currently define automated test scripts.
