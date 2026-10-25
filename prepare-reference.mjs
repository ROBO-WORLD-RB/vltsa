import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
const origin='https://ogoasis.io';
const $=cheerio.load(await fs.readFile('reference/index.html','utf8'));
await fs.mkdir('reference/scripts',{recursive:true});
await fs.mkdir('public/assets',{recursive:true});
const assets=new Map();
async function localize(url,dir='public/assets') {
 if(!url || url.startsWith('data:'))return url;
 const absolute=new URL(url,origin).href;
 if(assets.has(absolute))return assets.get(absolute);
 const filename=path.basename(new URL(absolute).pathname);
 const target=path.join(dir,filename);
 const local='/assets/'+filename;
 assets.set(absolute,local);
 const res=await fetch(absolute);if(!res.ok)throw Error(absolute+' '+res.status);
 await fs.writeFile(target,Buffer.from(await res.arrayBuffer()));return local;
}
for(const el of $('script[src]').toArray()) {
 const url=new URL($(el).attr('src'),origin);const res=await fetch(url);
 await fs.writeFile('reference/scripts/'+path.basename(url.pathname),await res.text());
}
for(const el of $('link[rel=stylesheet]').toArray()) {
 const url=$(el).attr('href');let css=await(await fetch(new URL(url,origin))).text();
 for(const match of [...css.matchAll(/url\(([^)]+)\)/g)]) {
  const value=match[1].replace(/["']/g,'');if(value.startsWith('data:'))continue;
  const local=await localize(new URL(value,new URL(url,origin)).href);css=css.replaceAll(match[0],`url(${local})`);
 }
 const name=path.basename(url);await fs.writeFile('public/assets/'+name,css);$(el).attr('href','/assets/'+name);
}
for(const el of $('img').toArray()) {
 let src=$(el).attr('src');if(src?.startsWith('/_next/image'))src=new URL(src,origin).searchParams.get('url');
 if(src)try{$(el).attr('src',await localize(src));}catch(e){console.log(e.message);}
 $(el).removeAttr('srcset').removeAttr('data-nimg');
}
$('script,iframe,link[rel=preload],link[rel=modulepreload]').remove();
$('meta[property],meta[name=twitter\:card],link[rel=icon]').remove();
await fs.writeFile('reference/rendered.html',$.html());
console.log('Downloaded assets:',assets.size);
console.log('Product card', $.html($('a[href^="/checkout/"]').first().parent()).slice(0,7000));
console.log('Inputs', $('input').map((i,e)=>$.html(e)).get());
