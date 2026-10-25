import {readFileSync,writeFileSync} from 'node:fs';
import {load} from 'cheerio';

const catalog=JSON.parse(readFileSync('data/catalog.json','utf8'));
for(const product of catalog){
  product.description=product.description.filter(line=>line!=='Account transfer details confirmed before purchase'&&line!=='Verified-style profile badge');
}
writeFileSync('data/catalog.json',JSON.stringify(catalog,null,2)+'\n');
const $=load(readFileSync('data/storefront-template.html','utf8'));
for(const product of catalog){
  const card=$('[data-product]').filter((_,el)=>$(el).attr('data-product')===product.id);
  card.find('ul').empty();
  for(const text of product.description)card.find('ul').append($('<li>').text(text));
}
$('.vlt-review p').text('Share your Vltstore experience with our community.');
writeFileSync('data/storefront-template.html',$.html());
console.log('Updated catalogue and customer-facing copy.');
