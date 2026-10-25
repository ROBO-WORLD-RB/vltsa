import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const data=JSON.parse(await fs.readFile('reference/badge-data.json','utf8'));
const basename=url=>path.basename(new URL(url).pathname);
await fs.mkdir('public/assets/models',{recursive:true});
await fs.mkdir('public/vendor',{recursive:true});
await Promise.all(data.tags.flatMap(tag=>[
 [tag.modelUrl,'public/assets/models/'+basename(tag.modelUrl)],
 [tag.backgroundImage,'public/assets/'+basename(tag.backgroundImage)]
]).map(async([url,file])=>{try{await fs.access(file);return;}catch{}const res=await fetch(url);if(!res.ok)throw Error(url+' '+res.status);await fs.writeFile(file,Buffer.from(await res.arrayBuffer()));console.log('Saved',file);}));

// The observed renderer is one self-contained Three.js/GLTF module. Adapt its
// export registration to ESM; no original page/bootstrap/checkout code runs.
let source=await fs.readFile('reference/badge-scripts/2kzc36e4zfxl_.js','utf8');
const start=source.indexOf('e=>{');
if(start<0||!source.endsWith('}]);'))throw Error('Unexpected renderer bundle structure');
if(/\be\.(i|r)\(\d+\)/.test(source))throw Error('Unexpected external module dependency');
source='// Renderer recovered from the supplied public reference; Three.js r184.\nconst recovered = {};\n('+source.slice(start,-3)+')({s(entries){for(let i=0;i<entries.length;i+=3)recovered[entries[i]]=entries[i+2];}});\n'+
 'export const {applyPose,createAnimState,createBlitPassRenderer,createGridModelRenderer,integrateAnim,loadModel}=recovered;\n';
source=source.replaceAll('https://www.gstatic.com/draco/versioned/decoders/1.5.7/','/vendor/draco/');
await fs.writeFile('public/vendor/badge-renderer.mjs',source);
const draco=new Set();
for(const tag of data.tags){const glb=await fs.readFile('public/assets/models/'+basename(tag.modelUrl));const length=glb.readUInt32LE(12);const json=JSON.parse(glb.subarray(20,20+length).toString());console.log(tag.name,glb.length,json.extensionsUsed||[]);if(json.extensionsUsed?.includes('KHR_draco_mesh_compression'))draco.add('needed');}
if(draco.size){await fs.mkdir('public/vendor/draco',{recursive:true});await Promise.all(['draco_wasm_wrapper.js','draco_decoder.wasm','draco_decoder.js'].map(async name=>{const res=await fetch('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'+name);if(!res.ok)throw Error('Decoder download failed');await fs.writeFile('public/vendor/draco/'+name,Buffer.from(await res.arrayBuffer()));}));}

const metadata=new Map(data.products.map(p=>[p.id,p]));
for(const file of ['data/catalog.json','public/catalog-preview.json']){
 const products=JSON.parse(await fs.readFile(file,'utf8'));
 for(const product of products){const meta=metadata.get(product.id);if(meta?.kind==='discord'&&meta.tag){product.tag=meta.tag.name;product.modelUrl='/assets/models/'+basename(meta.tag.modelUrl);product.image='/assets/'+basename(meta.tag.backgroundImage);}}
 await fs.writeFile(file,JSON.stringify(products,null,2));
}
const $=cheerio.load(await fs.readFile('public/index.html','utf8'));
for(const product of JSON.parse(await fs.readFile('public/catalog-preview.json','utf8'))){if(!product.modelUrl)continue;const card=$('[data-product]').filter((i,e)=>$(e).attr('data-product')===product.id);card.attr('data-tag',product.tag);card.find('img').first().attr('src',product.image);const frame=card.find('img').first().parent();frame.attr('data-badge-model',product.modelUrl).attr('data-badge-tag',product.tag);}
if(!$('script[src="/badges.mjs"]').length)$('head').append('<script type="module" src="/badges.mjs"></script>');
await fs.writeFile('public/index.html',$.html());
console.log('Badges connected to storefront and both catalogues.');
