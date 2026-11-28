# Bulldog Exchange client

The React/Vite storefront is part of the Bulldog Exchange MERN application. For MongoDB, API, payment, catalog, and deployment setup, see the project [README](../README.md).

## Local development

Install dependencies and configure the API URL:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to the complete API URL ending in `/api`. The default is `http://localhost:5000/api`.

## Checks

```powershell
npm run lint
npm run build
```
