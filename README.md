# vMule

Windows P2P client in the eMule tradition, plus a project website, Stripe server checkout, and a separate Python release admin.

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
| Shop | http://localhost:4242/shop.html |
| Update admin | http://127.0.0.1:5050/ |

## Build the NSIS installer

```bat
npm install
npm run build:win
```

Output: `dist/vMule-Setup-0.51.0.exe`

## Stripe

Put a [restricted API key](https://docs.stripe.com/keys/restricted-api-keys) in `STRIPE_SECRET_KEY`. Checkout uses Stripe Checkout Sessions. Webhook: `POST /api/stripe/webhook`.

Without keys, the shop runs in demo mode.

## Layout

```
electron/        Desktop shell
server/          Node API (VmuleEngine, VMLF TCP, REST + SSE)
public/website/  Project site
public/client/   Client UI
admin/           Python update admin
data/            Published updates
```
