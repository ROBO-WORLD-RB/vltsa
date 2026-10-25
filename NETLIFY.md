Deploy Vltstore with build command `npm run build`, publish directory `public`, and functions directory `netlify/functions` (configured in netlify.toml).

Set server environment variables: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_ORDERS_COLLECTION_ID`, `PUBLIC_BASE_URL`, `OXAPAY_MERCHANT_API_KEY`, and `OXAPAY_SANDBOX=false`. Use the existing Appwrite project values in `.env.example`. Never publish `.env`.

The function uses Appwrite as its only order store. `reservations` and `payment_events` are the default additional table IDs. All rows are private; only the server key accesses them. The key needs table/column/index permissions for setup and row read/write plus transaction permissions for runtime. Run `node scripts/appwrite-setup.mjs` once with setup permissions. Run `node scripts/verify-appwrite.mjs` for live storage integration checks with mocked OxaPay; the script removes only its own test records.

After deploying, `/api/health` should return `ok: true` and `orderStore: appwrite`. Verify `/api/catalog` returns the catalogue. Checkout and webhook confirmation require the OxaPay merchant key. Callback URL: `https://YOUR-DOMAIN/api/webhooks/oxapay`.

Reservations and orders commit in one Appwrite transaction. Confirmed expiry/failure releases the reservation in the same transaction as the order update. Unknown invoice outcomes retain stock. Appwrite outages fail checkout; no temporary local database is used. Existing SQLite files are preserved, and the SQLite adapter is reserved for explicit local tests.
