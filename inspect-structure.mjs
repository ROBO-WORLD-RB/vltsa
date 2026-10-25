import fs from 'node:fs/promises';import * as cheerio from 'cheerio';
const $=cheerio.load(await fs.readFile('reference/index.html','utf8'));
const a=$('a[href^="/checkout/"]').first();
let p=a;for(let i=0;i<4;i++){p=p.parent();console.log('PARENT',i,$.html(p).slice(0,i===2?7000:500));}
console.log('HEADERS', $('header').html());
console.log('FAQ', $('#faq').html());
console.log('CONTROLS', $('input').map((i,e)=>$.html(e)).get());
const c=cheerio.load(await fs.readFile('reference/checkout.html','utf8'));console.log('CHECKOUT',c('main').html()?.slice(0,18000));
