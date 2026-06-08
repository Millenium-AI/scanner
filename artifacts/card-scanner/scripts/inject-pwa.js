#!/usr/bin/env node
/**
 * Post-export step for the web build.
 *
 * Expo Router's `output: "single"` (SPA) mode emits a minimal index.html from
 * its own template and does NOT run app/+html.tsx, so our PWA / iOS
 * home-screen <head> tags never make it into the export. This script patches
 * dist/index.html after `expo export` to inject:
 *   • the web manifest link
 *   • Apple home-screen / standalone meta tags + apple-touch-icon
 *   • theme-color + viewport-fit=cover (notch-safe)
 *   • the service-worker registration script
 *
 * It is idempotent — running it twice won't duplicate the tags.
 */

const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`[inject-pwa] ${indexPath} not found. Run \`expo export\` first.`);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf-8");

const MARKER = "<!-- pwa-head-injected -->";
if (html.includes(MARKER)) {
  console.log("[inject-pwa] PWA tags already present — skipping.");
  process.exit(0);
}

const headTags = `${MARKER}
    <link rel="manifest" href="/manifest.json" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="CardScan" />
    <meta name="theme-color" content="#0D1117" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker
            .register('/service-worker.js')
            .then(function (reg) { console.log('[SW] registered', reg.scope); })
            .catch(function (err) { console.warn('[SW] registration failed', err); });
        });
      }
    </script>
`;

// Replace Expo's default viewport with a notch-safe, no-zoom one for standalone.
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />'
);

// Inject our tags just before </head>.
html = html.replace(/<\/head>/, `  ${headTags}  </head>`);

fs.writeFileSync(indexPath, html);
console.log("[inject-pwa] PWA + iOS home-screen tags injected into dist/index.html");
