import { readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import './build-pages.mjs';

const root = process.cwd();
mkdirSync(path.join(root, 'dist'), { recursive: true });
copyFileSync(path.join(root, 'server.mjs'), path.join(root, 'dist', 'server.mjs'));
const catalog = JSON.parse(readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8'));
if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('Catalogue is empty or invalid');
for (const product of catalog) {
  if (!product.id || !product.name || !Number.isSafeInteger(product.priceCents)) {
    throw new Error(`Invalid catalogue entry: ${product.id ?? '(missing id)'}`);
  }
}
const publicDir = path.join(root, 'public');
const required = ['index.html', 'store.js', 'store.css', 'checkout-ui.mjs', 'payments.css'];
for (const file of required) readFileSync(path.join(publicDir, file));
const assetCount = readdirSync(path.join(publicDir, 'assets'), { recursive: true }).length;
if (assetCount < 1) throw new Error('Public assets are missing');
console.log(`Vltstore build ready: ${catalog.length} catalogue entries, ${assetCount} public assets`);
