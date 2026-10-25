import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
const $=cheerio.load(await fs.readFile('reference/index.html','utf8'));
const chunks=[];
$('script').each((i,e)=>{const raw=$(e).text().match(/self\.__next_f\.push\((\[.*\])\)/s);if(raw)try{const p=JSON.parse(raw[1]);if(typeof p[1]==='string')chunks.push(p[1]);}catch{}});
const flight=chunks.join('');
const products=new Map(),tags=new Map();
function visit(value){if(!value||typeof value!=='object')return;if(value.modelUrl&&value.name)tags.set(value.id,value);if(value.id&&value.kind&&value.tag)products.set(value.id,value);for(const item of Object.values(value))visit(item);}
for(const line of flight.split('\n')){const idx=line.indexOf(':');if(idx>=0)try{visit(JSON.parse(line.slice(idx+1)));}catch{}}
await fs.writeFile('reference/badge-data.json',JSON.stringify({products:[...products.values()],tags:[...tags.values()]},null,2));
console.log('PRODUCTS',products.size,'TAGS',[...tags.values()]);
await fs.mkdir('reference/badge-scripts',{recursive:true});
for(const name of ['0h6r3ucfn-_6x.js','2kzc36e4zfxl_.js','3x0gi7necbuf7.js','17_nbf51vpksh.js']){
 const res=await fetch('https://ogoasis.io/_next/static/chunks/'+name);if(!res.ok){console.log(name,res.status);continue;}
 const text=await res.text();await fs.writeFile('reference/badge-scripts/'+name,text);
 console.log(name,text.length,[...text.matchAll(/.{0,100}(rotation|ambientLight|PerspectiveCamera|DirectionalLight|Math\.sin|rotationSpeed|modelUrl|\.glb).{0,160}/g)].slice(0,45).map(m=>m[0]));
}
