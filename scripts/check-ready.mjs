import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as cheerio from 'cheerio';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const issues=[],checks=[];
function check(name,ok){checks.push({name,ok});if(!ok)issues.push(name);}
check('Node.js 24.15+ or newer',Number(process.versions.node.split('.')[0])>24||Number(process.versions.node.split('.')[0])===24&&Number(process.versions.node.split('.')[1])>=15);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
check('Unique product IDs',new Set(catalog.map(p=>p.id)).size===catalog.length);
check('Valid prices and categories',catalog.every(p=>Number.isSafeInteger(p.priceCents)&&p.priceCents>=100&&['discord','minecraft','hytale','twitter','instagram','tiktok'].includes(p.category)));
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),$=cheerio.load(html);
const files=new Set(['/store.js','/checkout-ui.mjs','/store.css','/payments.css','/badges.mjs','/vendor/badge-renderer.mjs']);
$('[src],link[href]').each((i,e)=>{const src=$(e).attr('src')||$(e).attr('href');if(src?.startsWith('/'))files.add(src);});
for(const p of catalog)for(const src of [p.image,p.modelUrl])if(src?.startsWith('/'))files.add(src);
for(const css of ['store.css','payments.css',...fs.readdirSync(path.join(root,'public/assets')).filter(f=>f.endsWith('.css')).map(f=>'assets/'+f)]){
  for(const match of fs.readFileSync(path.join(root,'public',css),'utf8').matchAll(/url\(["']?(\/[^)"']+)["']?\)/g))files.add(match[1]);
}
const missing=[...files].filter(file=>!fs.existsSync(path.join(root,'public',file.split('?')[0])));
check(`Local assets (${files.size} files)`,missing.length===0);
if(missing.length)console.log('Missing assets:',missing);
const forbidden=/This reference listing is shown|Preview — not for sale|Vltstore must add its own inventory/;
check('Checkout contains no preview notices',!forbidden.test(html+fs.readFileSync(path.join(root,'public/checkout-ui.mjs'),'utf8')));
check('No merchant key references in browser code',!['store.js','checkout-ui.mjs','badges.mjs'].some(f=>fs.readFileSync(path.join(root,'public',f),'utf8').includes('OXAPAY_MERCHANT_API_KEY')));
const codeOnly=process.argv.includes('--code-only');
if(!codeOnly){
  check('OxaPay merchant key configured',!!process.env.OXAPAY_MERCHANT_API_KEY?.trim());
  let origin;try{origin=new URL(process.env.PUBLIC_BASE_URL);}catch{}
  check('Public HTTPS origin configured',!!origin&&origin.protocol==='https:'&&!/localhost|\.local$|\.example$|^127\./i.test(origin.hostname));
}
for(const result of checks)console.log(`${result.ok?'PASS':'PENDING'} ${result.name}`);
console.log(codeOnly?'Code and asset checks only.':'Live payment processing still requires a provider transaction and reachable HTTPS callback.');
if(issues.length)process.exitCode=1;
