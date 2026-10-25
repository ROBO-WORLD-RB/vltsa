import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
await fs.mkdir('data',{recursive:true});
await fs.mkdir('public',{recursive:true});
const $=cheerio.load(await fs.readFile('reference/index.html','utf8'));
const badgeMetadata=new Map((await fs.readFile('reference/badge-data.json','utf8').then(JSON.parse).catch(()=>({products:[]}))).products.map(p=>[p.id,p]));
const local=(src)=>'/assets/'+path.basename(new URL(src,'https://ogoasis.io').pathname);
$('script,iframe,template,link[rel=preload],link[rel=modulepreload],meta[property],meta[name^=twitter],link[rel=icon]').remove();
$('link[rel=stylesheet]').each((i,e)=>$(e).attr('href',local($(e).attr('href'))));
$('img').each((i,e)=>{let src=$(e).attr('src');if(src?.startsWith('/_next/image'))src=new URL(src,'https://ogoasis.io').searchParams.get('url');if(src)$(e).attr('src',local(src));$(e).removeAttr('srcset').removeAttr('data-nimg');if(/logo/i.test($(e).attr('alt')||''))$(e).attr('src','/assets/vltstore.svg').attr('alt','Vltstore Logo');});
// Text-node replacement also handles the reference's split O/G hero wordmark.
function rebrand(el){for(const child of el.children||[]){if(child.type==='text')child.data=child.data.replaceAll('OG Oasis','Vltstore');else rebrand(child);}}
rebrand($.root()[0]);
$('h1').html('<span class="brand-gold">Vlt</span><span class="text-white">store</span>');
$('nav a[href="/"]').first().find('span.text-2xl').html('<span class="brand-gold">Vlt</span><span class="text-white">store</span>');
$('footer a[href="/"]').first().find('span.text-2xl').html('<span class="brand-gold">Vlt</span><span class="text-white">store</span>');
$('title').text('Vltstore — Premium Discord, Minecraft & Hytale Usernames');
$('meta[name=description]').attr('content','Browse rare Discord, Minecraft and Hytale usernames at Vltstore. Crypto checkout powered by OxaPay.');
$('a[href^="https://discord.gg"],a[href^="https://t.me"]').attr('href','/#contact').removeAttr('target');
$('a[href="/terms"]').attr('href','/#terms');$('a[href="/privacy"]').attr('href','/#privacy');
// The original client reveals these after images load. Our static version needs no hydration.
$('div.opacity-0').removeClass('opacity-0').addClass('opacity-100');
$('div.absolute.inset-0').filter((i,e)=>$(e).find('.animate-spin').length>0).remove();
const products=[];
for(const section of ['discord','minecraft','hytale']){
 $(`#${section} a[href^="/checkout/"]`).each((i,e)=>{
  const card=$(e).parent().parent();const id=$(e).attr('href').split('/').pop();
  const name=card.find('h3').first().text();const priceText=card.find('.text-green-500').first().text();
  const priceCents=Math.round(Number(priceText.replace(/[^\d.]/g,''))*100);
  let image=card.find('img').first().attr('src');const description=card.find('li').map((i,e)=>$(e).text()).get();
  const meta=badgeMetadata.get(id);const modelUrl=meta?.kind==='discord'&&meta.tag?.modelUrl?'/assets/models/'+path.basename(meta.tag.modelUrl):null;
  if(modelUrl){image=local(meta.tag.backgroundImage);card.find('img').first().attr('src',image).parent().attr('data-badge-model',modelUrl).attr('data-badge-tag',meta.tag.name);}
  const bare=name.replace(/^@/,'');const tag=meta?.tag?.name||(/^\d+$/.test(bare)?`${bare.length} Number`:bare.length<=4?`${bare.length} ${/^[a-z]+$/i.test(bare)?'Letter':'Char'}`:'OG');
  card.attr('data-product',id).attr('data-name',name).attr('data-price',priceCents).attr('data-tag',tag);
  products.push({id,name,priceCents,category:section,tag,image,description,active:true,...(modelUrl?{modelUrl}:{})});
  const btn=$(e).find('button');$(e).text(btn.text()).attr('class',btn.attr('class')).attr('data-buy',id);
 });
 $(`#${section} .grid > div`).filter((i,e)=>!$(e).attr('data-product')&&$(e).find('h3').length&&$(e).find('button[disabled]').length).each((i,e)=>{const card=$(e);card.attr('data-product','sold-'+section+'-'+i).attr('data-name',card.find('h3').text()).attr('data-price',Math.round(Number(card.find('.text-green-500').first().text().replace(/[^\d.]/g,''))*100)).attr('data-tag',card.find('h3').text().length===3?'3 Char':'OG');});
 $(`#${section} button`).filter((i,e)=>$(e).text().trim()==='Load More').attr('data-load-more',section);
 const sidebar=$(`#${section} [role=tablist]`).parent();
 sidebar.find('[role=tabpanel]').remove();
 const search=$('<label class="vlt-search">Search usernames<input type="search" placeholder="Search usernames…" aria-label="Search '+section+' usernames"></label>');
 sidebar.before(search);
 const sliders=$(`#${section} [role=slider]`);
 sliders.each((i,e)=>{$(e).removeAttr('role').removeAttr('tabindex');});
 const sliderContainers=$(`#${section} [data-orientation=horizontal]`).filter((i,e)=>$(e).find('[aria-valuemin]').length>0 && $(e).find('[aria-valuemin]').length===2);
 sliderContainers.each((i,e)=>{if($(e).parent().closest('[data-vlt-range]').length)return;$(e).attr('data-vlt-range','true').html(i===0?'<input type="range" min="0" max="100000" value="100000" step="50" data-price-filter aria-label="Maximum price"><output>Up to $100,000</output>':'<input type="range" min="2" max="30" value="30" data-length-filter aria-label="Maximum username length"><output>Any length</output>');});
 $(`#${section} [role=tab]`).removeAttr('aria-controls').removeAttr('tabindex');
 $(`#${section} .grid`).filter((i,e)=>$(e).children('[data-product]').length>0).append('<p class="vlt-empty" hidden>No usernames match these filters.</p>');
}
// Reference reviews are not Vltstore purchases. Retain the section's visual shell.
$('#reviews .container').html('<div class="text-center mb-12"><h2 class="text-3xl md:text-4xl font-bold mb-3 brand-gold">Reviews</h2><div class="max-w-[500px] h-px w-full mx-auto bg-linear-to-r from-transparent to-transparent via-orange-400/50"></div></div><div class="vlt-review"><span class="brand-gold" style="font-size:32px">☆ ☆ ☆ ☆ ☆</span><h3>Your experience matters</h3><p>Verified Vltstore reviews will appear here after our first completed orders.</p></div>');
const answers=["A sniped username is a rare name secured as it becomes available. Each listing describes what is included.","Delivery starts after your payment is confirmed. The delivery method and timing are specified in each listing.","Payments are processed through OxaPay. Vltstore verifies payment confirmations on the server before marking an order paid.","Choose a cryptocurrency and network at checkout. Your payment address and QR code appear directly on Vltstore.","For help with your purchase, keep your order link and order reference. Your order page shows your current payment and delivery status."];
$('#faq button').each((i,e)=>{$(e).attr('data-faq',i).attr('aria-controls','faq-answer-'+i);$(e).closest('h3').next().attr('id','faq-answer-'+i).html('<p class="px-6 pb-4 text-gray-400">'+answers[i]+'</p>');});
$('nav button').attr('aria-label','Open navigation').attr('aria-expanded','false').attr('data-menu','');
$('nav').append('<div id="mobile-menu" hidden><a href="/">Home</a><a href="/#discord">Discord</a><a href="/#minecraft">Minecraft</a><a href="/#hytale">Hytale</a><a href="/#reviews">Reviews</a><a href="/#faq">FAQ</a></div>');
$('body').append('<dialog id="info-dialog"><button type="button" class="dialog-close" aria-label="Close dialog">×</button><h2></h2><p></p></dialog>');
$('head').append('<link rel="icon" href="/assets/vltstore.svg"><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/payments.css"><script src="/store.js" defer></script><script type="module" src="/badges.mjs"></script>');
await fs.writeFile('public/index.html',$.html());
await fs.writeFile('data/catalog.json',JSON.stringify(products,null,2));
await fs.writeFile('public/catalog-preview.json',JSON.stringify(products));
await fs.writeFile('public/assets/vltstore.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#fbbf24"/><path d="m9 10 10 22h3l10-22h-7l-5 13-5-13z" fill="#0c1428"/></svg>');
console.log(`Built Vltstore with ${products.length} preview products`);
