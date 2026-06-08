# CardScan — Web / PWA build

This Expo app now ships an installable Progressive Web App in addition to the
native iOS/Android targets. The PWA runs the **live device camera** for
scanning and can be added to the iPhone home screen as a standalone app.

## Build the web app

```bash
pnpm --filter @workspace/card-scanner run build:web
```

This runs `expo export --platform web` (SPA / `output: "single"`) into `dist/`,
then `scripts/inject-pwa.js` patches `dist/index.html` with the PWA manifest
link, iOS home-screen meta tags, theme color, and the service-worker
registration. Static PWA files live in `public/` and are copied verbatim:

- `public/manifest.json` — web app manifest
- `public/service-worker.js` — offline app shell + installability
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`

## Deploy to Netlify

`netlify.toml` is preconfigured:

- base: `artifacts/card-scanner`, command: `pnpm run build:web`, publish: `dist`
- SPA fallback redirect to `/index.html`
- `Permissions-Policy: camera=(self)` so the camera works in standalone mode
- no-cache headers + `Service-Worker-Allowed: /` for the service worker

**Set the backend URL** in Netlify → Site settings → Environment variables:

```
EXPO_PUBLIC_BACKEND_URL = https://<your-identify-backend>
```

It must be **HTTPS** in production, otherwise the browser blocks the
mixed-content upload to `/identify-card`.

You can either connect the repo to Netlify (it will run the build) or run
`pnpm run build:web` locally and drag the `dist/` folder into Netlify.

## Installing on iPhone (live camera)

A continuous live camera feed in an installed home-screen web app works
reliably in **Safari** on iOS. Open the deployed HTTPS URL in **Safari**, tap
**Share → Add to Home Screen**, then launch it from the icon. Grant camera
access when prompted and the live scanner + auto-scan run full screen.

> iOS note: Apple restricts `getUserMedia` for home-screen web apps to Safari's
> engine. Chrome for iOS in standalone mode may not grant the live feed; if the
> camera is unavailable the screen falls back to an "Upload a photo" flow.

## How the camera is wired

- `components/WebCameraScanner.tsx` — `getUserMedia` rear-camera stream into a
  `<video>` element, exposes `captureFrame()` → base64 JPEG data URI.
- `hooks/useAutoScanWeb.ts` — periodic auto-capture with backoff.
- `app/(tabs)/index.tsx` (`WebScannerScreen`) — mounts the live camera,
  auto-scans, supports manual capture, and falls back to photo upload.
- `services/cardScanService.ts` — converts the web data URI / object URL into a
  real `Blob` before uploading (the native `{uri,name,type}` form-data shim does
  not work in a browser).
