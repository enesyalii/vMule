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
| APK Studio | http://localhost:4242/apk-studio/ |

## APK Studio

NBTExplorer-style editor for Android APK files. Browse the archive tree, view decoded `AndroidManifest.xml`, inspect DEX headers and images, edit text entries, and export a rebuilt APK.

Web UI:

```bat
npm install
npm start
```

Then open http://localhost:4242/apk-studio/

Desktop shell (separate port):

```bat
npm run electron:apk
```

Or run the server only on port 4243:

```bat
start-apk-studio.bat
```

Build portable Windows app:

```bat
npm run build:apk-studio
```

Output: `dist/APK-Studio-0.51.0.exe`

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
admin/           Python update admin
data/            Published updates
```
