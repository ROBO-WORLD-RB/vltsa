import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { load } from 'cheerio';

const source=readFileSync('data/storefront-template.html','utf8');
const catalogue=JSON.parse(readFileSync('data/catalog.json','utf8'));
const categories=[['discord','Discord'],['minecraft','Minecraft'],['hytale','Hytale'],['twitter','X / Twitter'],['instagram','Instagram'],['tiktok','TikTok']];
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function navigation($,current='/'){
  for(const [id] of categories)$(`a[href="/#${id}"]`).attr('href',`/${id}`);
  $('nav a').each((_,el)=>{const a=$(el);if(a.attr('href')===current)a.attr('aria-current','page');else a.removeAttr('aria-current');});
}
mkdirSync('public/pages',{recursive:true});
for(const [id,label] of categories){
  const $=load(source),section=$(`#${id}`).clone();
  const available=new Map(catalogue.filter(p=>p.category===id).map(p=>[p.id,p.active===true]));
  section.find('[data-product]').each((_,el)=>{const card=$(el), productId=card.attr('data-product'), button=card.find('[data-buy]'), active=available.get(productId)===true;if(button.length){button.text(active?'Buy now':'Unavailable').attr('aria-disabled',String(!active));if(active)button.removeAttr('disabled');else button.attr('disabled','disabled');}});
  const heading=section.find('h2').first();
  heading.replaceWith($('<h1>').attr(heading.attr()).text(heading.text()));
  $('main').empty().addClass('category-page').append('<a href="/" class="category-breadcrumb">← All collections</a>').append(section);
  $('title').text(`${label} Accounts — Vltstore`);
  $('meta[name=description]').attr('content',`Browse ${label} usernames and accounts at Vltstore. Filter by name, price and length.`);
  navigation($,`/${id}`);
  writeFileSync(`public/pages/${id}.html`,$.html());
}
const $=load(source);
const cards=categories.map(([id,label])=>{
  const items=catalogue.filter(p=>p.category===id),first=items[0];
  return `<a href="/${id}" class="collection-link"><div class="collection-art" ${first.modelUrl?`data-badge-model="${escape(first.modelUrl)}" data-badge-tag="OG"`:''}><img src="${escape(first.image)}" alt="${escape(label)} collection" loading="lazy"></div><div class="collection-copy"><h3>${escape(label)}</h3><p>${items.length} usernames · Explore the collection</p><span>Browse ${escape(label)} →</span></div></a>`;
}).join('');
const collections=`<section class="collections" id="collections"><div class="collections-heading"><h2>Find your next identity</h2><p>Choose a platform to explore its usernames and accounts.</p></div><div class="collections-grid">${cards}</div></section>`;
$('#discord').before(collections);
for(const [id] of categories)$(`#${id}`).remove();
navigation($);
writeFileSync('public/index.html',$.html());
// Category navigation must be safe on pages that only contain one catalogue.
const store=readFileSync('public/store.js','utf8').replace("const section=document.getElementById(item.category);const template=", "const section=document.getElementById(item.category);if(!section)continue;const template=");
writeFileSync('public/store.js',store);
const checkout=readFileSync('public/checkout-ui.mjs','utf8').replace('href="/#${escape(p.category)}"','href="/${escape(p.category)}"');
writeFileSync('public/checkout-ui.mjs',checkout);
console.log('Built homepage and six dedicated category pages.');
