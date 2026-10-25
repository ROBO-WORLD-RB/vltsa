import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
const $=cheerio.load(await fs.readFile('reference/index.html','utf8'));
console.log(JSON.stringify({css:$('link[rel=stylesheet]').map((i,e)=>$(e).attr('href')).get(),scripts:$('script[src]').map((i,e)=>$(e).attr('src')).get(),links:$('a').map((i,e)=>({text:$(e).text(),href:$(e).attr('href')})).get(),buttons:$('button').map((i,e)=>({text:$(e).text(),html:$.html(e).slice(0,700)})).get().slice(0,18),sections:$('section').map((i,e)=>({id:$(e).attr('id'),text:$(e).text().slice(0,500)})).get()},null,2));
