# Vltstore

A local reconstruction of the public OG Oasis storefront with Vltstore branding and a separate OxaPay payment backend. Node.js 24.15+ is required.

```powershell
npm ci
Copy-Item .env.example .env
npm run db:init
npm start
```

Open http://localhost:3000. Run `npm test` for payment integration checks. No merchant key is required to view the storefront.

## Database

The catalogue is managed in `data/catalog.json`; customer order data is stored in Appwrite TablesDB.

Appwrite TablesDB is the authoritative order store by default. Configure the server variables in `.env.example`, then run `node scripts/appwrite-setup.mjs` to provision its schema. Orders, customer tokens, payment instructions, reservations and verified callback receipts are persisted in Appwrite. Checkout reserves stock and creates an order in one transaction; status changes use conflict detection and retries. Netlify requires this storage mode and never falls back to SQLite. SQLite is available only for explicit local tests (`dbPath`) or `ORDER_STORE=sqlite`.

Run `npm run db:init` to create or migrate the database without starting the server. Run `npm run db:status` to check integrity, schema and record counts. Both commands are idempotent and never contact OxaPay. The default local database is `data/orders.sqlite`; change `DATABASE_PATH` for deployment. Database files and `.env` secrets are excluded from Git.

For a Docker deployment, `docker compose up --build -d` uses a named persistent volume mounted at `/app/storage`. Configure `.env` first and put a public HTTPS reverse proxy in front of the service. The volume preserves orders across container replacements. Do not delete that volume when updating the application. Use one application instance with this SQLite setup.

## Payments and inventory

See [PAYMENTS.md](PAYMENTS.md) for server secrets, public HTTPS hosting, persistent SQLite storage, sandbox verification and activation. Payments are disabled until the merchant key is supplied. This project is not deployed to a public host.

The current 39 catalogue listings are enabled for checkout. Manage entries in `data/catalog.json`, including `id`, `name`, `category` (`discord`, `minecraft`, or `hytale`), `priceCents`, `image` (a local `/assets/` path or HTTPS URL), `description` (string array), `tag`, and `active`. New active entries appear automatically; the API determines the amount and availability. Use stable unique IDs for one-off items. Never put delivery credentials in public catalogue fields.

Payment confirmations are stored persistently. Actual delivery is currently manual (`awaiting_delivery`); an email/credential delivery service has not been configured. Add your support channels, purchase terms and privacy policy before sales. Reference reviews were replaced with a new-store placeholder.

## Files

The homepage links to six dedicated catalogue pages: `/discord`, `/minecraft`, `/hytale`, `/twitter`, `/instagram`, and `/tiktok`. Each page has independent search, price and length filters. Checkout returns to its own category page. Old category hash links redirect to the new pages.

The catalogue includes 18 proposed social listings (six per platform) with original animated GLB badges. These entries start with `active: false`; confirm actual stock before enabling purchases. TikTok uses a black background with white, cyan and pink logo details.

`data/storefront-template.html` is the source layout. `npm run build` generates the homepage and category HTML through `scripts/build-pages.mjs`. `scripts/add-social-categories.mjs` generates the original social meshes and fallback artwork and adds missing social entries without changing existing inventory.

- `public/index.html`, `public/store.js`, `public/store.css`: storefront, filters, responsive navigation, checkout and order status.
- `public/badges.mjs`, `public/vendor/badge-renderer.mjs`: shared WebGL rendering for original 3D tag models, hover tilt, gentle oscillation and shimmer.
- `server.mjs`: HTTP server, inventory reservations and OxaPay integration.
- `public/checkout-ui.mjs`, `public/payments.css`, `payment-methods.mjs`: functional coin and network selectors, on-site OxaPay payment instructions, QR codes, copy controls and live order status.
- `data/catalog.json`: authoritative server catalogue.
- `tests/payments.test.mjs`: mocked integration tests; no real charges.
- `Dockerfile`: container deployment; mount persistent storage as described in PAYMENTS.md.
- `reference/`: local downloaded inspection material and REA evidence, excluded from Git and the runtime Docker image. It is not required to run the app.

`prepare-reference.mjs` downloads the reference site's public assets; `build-store.mjs` regenerates the original storefront markup and catalogue. **Do not run it over a production inventory catalogue.** Regular operation needs no build step.

## Inspection boundaries

The public homepage and checkout were visually inspected. Styling, fonts and sample product imagery are retained locally from the supplied reference URL. Its original JavaScript, analytics, original checkout and support links are not executed by Vltstore.

Discord product cards and checkout now use the original local GLB tag models and backgrounds, including gold OG and green 2 CHAR. Their metadata comes from the reference's public page data instead of name-length guesses. The renderer preserves the reference's camera, lights, materials, default angle, hover tilt, oscillation and recurring shimmer. It uses one shared WebGL context for the visible cards, suspends work offscreen, and honors reduced motion.

REA runtime evidence `ev_238ffee45737c1f60c623b077fad79b65ed88dfb4e111c3a543d4f072fcd73fa` in `reference/badge-runtime-evidence.json` observed the reference checkout requesting its GLB models and renderer chunks. `scripts/inspect-badges.mjs` extracts public tag metadata and downloads those chunks; `scripts/add-badge-assets.mjs` vendors the models and adapts the self-contained rendering module's exports to ESM. The copied rendering module contains no original checkout, analytics or page bootstrap. The frontend integration in `public/badges.mjs` is new code. Screenshot checks confirm both badge types on checkout and catalogue, and the gold badge's change in pose and shimmer after hovering. The nine existing payment tests still pass.

REA CLI inspected the 12 downloaded JavaScript chunks. Evidence ID: `ev_801ce0465b7aac54f7a34cb99b3e944cd028c8548a2036aa2b762d5e58e2f1cc`, saved in `reference/rea-analysis.json`. Static coverage is partial: one framework chunk exhausted the bounded analysis heap; dynamic behavior and the original private backend were not recovered. Reconstructed interactions and the OxaPay backend are new implementations. The captured initial catalogue contains 39 purchasable reference listings plus 3 sold sample cards; further live inventory was not imported.
