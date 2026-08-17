# vMule

Windows P2P client in the eMule tradition, plus a project website, account system, server console, payment checkout, and a separate Python release admin.

Share only files you have the right to distribute. The demo catalog is public-domain, open-source, and Creative Commons material.

## Download

Windows installer (NSIS): [latest release](https://github.com/enesyalii/vMule/releases/latest)

## Run from source

```bat
copy .env.example .env
npm install
start.bat
```

Set secrets in `.env` only. Do not commit that file.

Python update admin (separate process):

```bat
pip install -r admin\requirements.txt
start-admin.bat
```

| What | Local URL |
| --- | --- |
| Website | http://localhost:4242/ |
| Client | http://localhost:4242/client/ |
| Account | http://localhost:4242/account/ |
| Server console | http://localhost:4242/server-admin/ |
| Shop | http://localhost:4242/shop.html |
| Update admin | http://127.0.0.1:5050/ |

## Accounts and server console

Accounts use signed, HTTP-only cookies and scrypt password hashes. The first
registered account becomes administrator when no administrator exists. You can
also configure a durable environment administrator with `ADMIN_USER` and
`ADMIN_PASSWORD`.

Local development stores accounts and runtime state in ignored JSON files.
For Vercel or multi-instance deployments, set `DATABASE_URL` to PostgreSQL.
The backend automatically creates `vmule_users`, `vmule_runtime_state`, and
`vmule_purchases`, then hydrates and persists the engine on every serverless
request. Also set a long random `AUTH_SECRET`. Registration can be disabled
with `ALLOW_REGISTRATION=0`.

The administrator console at `/server-admin/` manages VMLF/Kad connections,
transfers, servers, runtime settings, logs, and user roles.

## Build the NSIS installer

```bat
npm install
npm run build:win
```

Output: `dist/vMule-Setup-0.51.0.exe`

## Stripe

Put a [restricted API key](https://docs.stripe.com/keys/restricted-api-keys) in `STRIPE_SECRET_KEY`. Checkout uses Stripe Checkout Sessions. Webhook: `POST /api/stripe/webhook`.

## Polar

Organization access token in `POLAR_ACCESS_TOKEN`. Map products with `POLAR_PRODUCT_STARTER` and `POLAR_PRODUCT_PRO`. Webhook: `POST /api/polar/webhook` (subscribe to `order.paid`). Set `POLAR_SANDBOX=1` for sandbox API.

Without payment keys, the shop runs in demo mode.


## Layout

```
electron/        Desktop shell
server/          Node API (VmuleEngine, VMLF TCP, REST + SSE)
public/website/  Project site
public/client/   Client UI
public/account/  Sign-in, registration, profile
public/server-admin/  Authenticated server console
admin/           Python update admin
data/            Published updates
```
