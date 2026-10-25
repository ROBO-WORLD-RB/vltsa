# Vltstore readiness check — October 25, 2026

Local application verification passed after the fixes below. Live payment processing has not been certified because the merchant key and public HTTPS address are not configured.

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| Payment backend | Pass | 16 integration tests: server prices, coin/network requests, raw-body HMAC, authoritative reconciliation, duplicate callbacks, early callbacks, partial payment, manual acceptance, refund transitions, simultaneous buyers and database reopening. All provider responses in these tests are mocked. |
| Public routes | Pass | 77 page/script/image/stylesheet routes returned HTTP 200. |
| Assets and catalogue | Pass | 60 local asset paths exist; 39 unique catalogue IDs, valid integer prices and supported categories. |
| Dependency audit | Pass | `npm audit --omit=dev`: zero known vulnerabilities. This is a dependency audit, not a complete security audit. |
| Private files | Pass | Requests for `.env`, server source, SQLite orders and the test fixture returned 404. |
| Desktop browsing | Pass | Username search, category filters, price slider, FAQ and terms dialog worked; no console warnings/errors observed. |
| Mobile | Pass | Checked at 390 × 844: menu opens/closes, checkout is usable, coin/network controls work and main content has no horizontal overflow. Viewport reset afterward. |
| 3D badges | Pass | Models load successfully, including the OG model on checkout; the shared canvas remains below the navigation. |
| Extended coin list | Pass | Selecting a coin from More and collapsing the list keeps the selection visible and keyboard reachable. |
| Full payment UI | Pass, isolated provider | Browser → checkout API → in-memory SQLite → address/amount/QR → confirmed order. A paid listing becomes Sold Out. Back/Forward returns to the correct screen. No funds sent and no live invoice created. |
| Merchant key | Pending | `OXAPAY_MERCHANT_API_KEY` is blank. An ignored `.env` template is prepared. No keys were printed or placed in browser files. |
| Public HTTPS and callback | Pending | `PUBLIC_BASE_URL` is currently localhost. Public deployment and a reachable signed callback have not been verified. |
| Delivery/support | Pending | Paid orders currently await manual delivery. Account credentials, automatic email delivery and real customer support destinations have not been supplied/configured. |
| Container build | Unverified | Docker CLI is installed but the local Docker daemon is not running. No image build was attempted after that check failed. |

## Fixes completed

- Category filters now use the listing's category tag instead of guessing from username length. Minecraft cape codes appear under Misc.
- Browser Back/Forward restores the proper checkout or order page after on-site payment creation.
- Browser session-storage failures no longer prevent payment navigation.
- A selected cryptocurrency stays accessible when the expanded coin list is collapsed.
- Provider-confirmed Underpaid, manual_accept, Refunding and Refunded states are handled explicitly. Stale updates cannot revert a confirmed refund or downgrade a paid order to pending/expired.
- Docker uses a separate `/app/storage` volume for SQLite so persistence does not hide the catalogue under `/app/data`.
- Environment variants are excluded from source control and Docker context, except the blank example file.
- Added repeatable `npm run check` and `npm run check:ready` commands.

## Next launch steps

Set the merchant key and public HTTPS origin in server environment variables, deploy with persistent storage, verify your accepted currencies and a reachable callback, then complete an OxaPay provider-backed verification. Supply actual delivery and support details before opening sales. Do not infer live readiness from the local mocked checks.

Payment state and callback behavior checked against [OxaPay's status table](https://docs.oxapay.com/api-reference/payment/payment-status-table), [webhook documentation](https://docs.oxapay.com/webhook), and [white-label payment API](https://docs.oxapay.com/api-reference/payment/generate-white-label).
