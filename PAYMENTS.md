# Vltstore payment operations

Node.js 24.15 or newer is required for built-in SQLite. Run `npm ci`, copy `.env.example` to `.env`, then run `node server.mjs`. The default address is http://localhost:3000. The API key stays on the server.

## Before enabling sales

- The current 39 catalogue listings are enabled for checkout as requested. Manage their names, prices, stock and availability in `data/catalog.json`. Each product needs a unique `id`, `name`, integer USD `priceCents`, `category`, and `active: true`. Set `active: false` to remove a listing from sale.
- Configure actual inventory delivery and customer support. Successful payments are recorded as `paid` and `awaiting_delivery`; this project does not email credentials or deliver third-party accounts. No third-party credentials or stock are imported.
- Host the Node server at a public HTTPS address. Set `PUBLIC_BASE_URL` to that exact origin. Set `HOST=0.0.0.0` behind the host's HTTPS reverse proxy. Use one application instance and mount persistent storage for `DATABASE_PATH`; container-local ephemeral storage is insufficient. Back up the SQLite database and its WAL together using a consistent SQLite backup process.
- The Docker image stores its database under `/app/storage/orders.sqlite`. Mount a persistent volume at `/app/storage`; keep `/app/data` inside the image so the catalogue and supported-currency data remain available.
- Put the OxaPay **Merchant API Key** into the host's secret environment configuration as `OXAPAY_MERCHANT_API_KEY`. Do not commit `.env` or enter keys into frontend code.
- `OXAPAY_SANDBOX=false` is the default for real payments. The on-site coin buttons use OxaPay's white-label API, which does not document a sandbox parameter. The customer checkout has no hosted-payment option or external redirect. Use the isolated browser fixture and mocked tests for pre-key verification. Confirm the callback endpoint is reachable at `https://YOUR-DOMAIN/api/webhooks/oxapay`.

## Payment behavior

Customer checkout submits `productId`, `email`, `payCurrency` and `network` to `POST /api/checkout`. Prices come from the server catalogue, never the client. The response contains OxaPay-generated address, amount, coin, network, memo and expiration details and an opaque order `token`. Customers stay on Vltstore at `/?order=TOKEN`; `GET /api/orders/TOKEN` reads the verified payment status without disclosing the buyer email. The older hosted-invoice API path remains for compatibility and integration tests but is not exposed in the customer UI.

`GET /api/payment-methods` intersects the provider's current supported currencies/networks with those accepted by your merchant account, cached for five minutes. Without a key, coin selectors use the checked-in provider currency snapshot; no addresses or invoices are fabricated. `GET /api/orders/TOKEN/qr.svg` generates a local address QR code for an unpaid, unexpired order. Instructions disappear after expiry or confirmation. The UI includes network selection, amount/address/memo copy buttons, a countdown and automatic status polling.

SQLite reserves one order per unique product. A `Paid` order permanently prevents another checkout. A signed callback alone does not approve an order: the server fetches OxaPay payment information and checks the track ID, order ID, invoice type, expected USD amount and currency. The raw callback body is checked using HMAC-SHA512 and a constant-time comparison. Duplicate event digests are recorded once. A later callback cannot downgrade a paid order.

A pending invoice whose local expiration time has passed remains reserved until OxaPay confirms `Expired` or `Failed`. An ambiguous request timeout becomes `invoice_unknown` and remains reserved: the provider may have created an invoice before the connection failed. Do not simply delete this reservation or activate a replacement listing. Find its `order_id` and `track_id` in the OxaPay dashboard, then run:

```text
node scripts/reconcile-order.mjs ORDER_ID OXAPAY_TRACK_ID
```

This verifies the invoice directly with OxaPay before recording its status. If no provider invoice can be established, investigate manually; the script does not offer an unsafe force-release option. Orders with status `creating` left by a process crash need the same recovery review.

Run `node --test tests/payments.test.mjs` for mocked integration tests; these tests never create invoices or transfer funds. Actual OxaPay sandbox/live transactions cannot be tested until the merchant key and a public HTTPS callback are configured.

Run `npm run check` for code, catalogue and local asset checks. Run `npm run check:ready` to also check for a configured merchant key and public HTTPS URL. Configuration checks do not certify live payment settlement or callback reachability; those require provider verification after deployment.

Official references: [Generate Invoice](https://docs.oxapay.com/api-reference/payment/generate-invoice), [Generate White Label](https://docs.oxapay.com/api-reference/payment/generate-white-label), [Accepted Currencies](https://docs.oxapay.com/api-reference/payment/accepted-currencies), [Supported Currencies](https://docs.oxapay.com/api-reference/common/supported-currencies), [Payment Information](https://docs.oxapay.com/api-reference/payment/payment-information), [Webhook verification](https://docs.oxapay.com/webhook).
