// Generate original mesh assets and extend the catalogue without replacing existing stock.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { load } from 'cheerio';

const platforms = [
  { id:'twitter', label:'X / Twitter', colour:'#a3b9d1', base:[.035,.05,.08,1], names:[['titan',32000],['icon',28500],['legend',25000],['reign',19500],['oracle',14000],['bronze',9500]] },
  { id:'instagram', label:'Instagram', colour:'#f294df', base:[.43,.035,.32,1], names:[['crown',30000],['prime',26000],['onyx',22000],['blaze',17500],['phantom',12500],['erase',8500]] },
  { id:'tiktok', label:'TikTok', colour:'#64f4e5', base:[0,0,0,1], names:[['myth',28000],['legend',25000],['titan',22500],['icon',20000],['asap',15000],['coerce',7500]] },
];

const socialStats = {
  twitter: {
    titan: ['Legacy era username', '187.47K followers'], icon: ['Legacy era username', '164.32K followers'], legend: ['2012-era handle', '248.80K followers'], reign: ['Legacy era username', '195.14K followers'], oracle: ['2014-era handle', '316.72K followers'], bronze: ['Legacy era username', '152.63K followers']
  },
  instagram: {
    crown: ['Short handle', '284.47K followers', '3.82M profile views'], prime: ['Short handle', '196.25K followers', '2.41M profile views'], onyx: ['Short handle', '172.08K followers', '1.98M profile views'], blaze: ['Short handle', '251.63K followers', '1.64M profile views'], phantom: ['Short handle', '238.39K followers', '1.42M profile views'], erase: ['Short handle', '222.74K followers', '1.26M profile views']
  },
  tiktok: {
    myth: ['Short creator handle', '640.47K followers', '18.2M likes'], legend: ['Short creator handle', '420.18K followers', '11.8M likes'], titan: ['Short creator handle', '295.73K followers', '7.4M likes'], icon: ['Short creator handle', '180.56K followers', '4.9M likes'], asap: ['Short creator handle', '196.42K followers', '2.1M likes'], coerce: ['Short creator handle', '154.87K followers', '1.08M likes']
  }
};
function socialPrice(platform, stats, fallback) {
  const followers = Number((stats.find(value=>value.includes('followers'))||'0').replace(/[^0-9.]/g,''));
  const likes = Number((stats.find(value=>value.includes('likes'))||'0').replace(/[^0-9.]/g,''));
  const followerValue = (stats.find(value=>value.includes('followers'))||'').includes('M') ? followers*1000 : followers;
  const likeValue = (stats.find(value=>value.includes('likes'))||'').includes('M') ? likes : likes/1000;
  if(!followerValue)return fallback*100;
  const dollars = platform==='tiktok' ? 5000 + followerValue*35 + likeValue*500 : 4000 + followerValue*40;
  return Math.round(dollars*100);
}

function rounded(w,h,r=0.2) {
  const points=[];
  for (let corner=0;corner<4;corner++) {
    const a=corner*Math.PI/2, cx=(corner===0||corner===3?1:-1)*(w/2-r), cy=(corner<2?1:-1)*(h/2-r);
    for(let j=0;j<=10;j++){const t=a+j/10*Math.PI/2;points.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}
  }
  return points;
}
function model(platform) {
  const positions=[],normals=[],primitives=[],materials=[],chunks=[];
  const material=(colour,metallic=.65,roughness=.27)=>{materials.push({pbrMetallicRoughness:{baseColorFactor:colour,metallicFactor:metallic,roughnessFactor:roughness},doubleSided:true});return materials.length-1;};
  const dark=material(platform.base,platform.id==='tiktok'?.1:.65,platform.id==='tiktok'?.55:.27), rim=material([.33,.39,.48,1],.9,.2),white=material([.92,.95,1,1],.55,.2),gold=material([1,.65,.15,1],.8,.23),cyan=material([.02,.95,.91,1],.4),pink=material([1,.035,.25,1],.4);
  const tri=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;for(const p of [a,b,c]){positions.push(...p);normals.push(...n.map(x=>x/l));}};
  function mesh(mat,draw){const start=positions.length/3;draw();primitives.push({mat,start,count:positions.length/3-start});}
  function prism(points,z,depth,mat){mesh(mat,()=>{const back=z-depth;for(let i=1;i<points.length-1;i++){tri([...points[0],z],[...points[i],z],[...points[i+1],z]);tri([...points[0],back],[...points[i+1],back],[...points[i],back]);}points.forEach((p,i)=>{const q=points[(i+1)%points.length];tri([...p,z],[...p,back],[...q,z]);tri([...q,z],[...p,back],[...q,back]);});});}
  function ring(outer,inner,z,depth,mat){mesh(mat,()=>{for(let i=0;i<outer.length;i++){const j=(i+1)%outer.length;const a=[...outer[i],z],b=[...outer[j],z],c=[...inner[i],z],d=[...inner[j],z];tri(a,b,c);tri(b,d,c);for(const [p,q] of [[outer[i],outer[j]],[inner[j],inner[i]]]){tri([...p,z],[...p,z-depth],[...q,z]);tri([...q,z],[...p,z-depth],[...q,z-depth]);}}});}
  function bar(x,y,w,h,z,mat,angle=0){const c=Math.cos(angle),s=Math.sin(angle);prism([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([a,b])=>[x+a*c-b*s,y+a*s+b*c]),z,.09,mat);}
  const circle=(x,y,rx,ry=rx)=>Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[x+Math.cos(a)*rx,y+Math.sin(a)*ry];});
  prism(rounded(1.92,2,.27),-.07,.18,rim);
  prism(rounded(1.86,1.94,.25),.035,.13,dark);
  ring(rounded(1.76,1.84,.22),rounded(1.71,1.79,.20),.055,.025,gold);
  // Raised crown above each platform emblem.
  prism([[-.3,.57],[-.34,.78],[-.16,.67],[0,.86],[.16,.67],[.34,.78],[.3,.57]],.14,.07,gold);
  bar(0,.52,.58,.045,.14,gold);
  if(platform.id==='twitter'){
    bar(0,-.16,.13,1.1,.18,white,-.63);
    bar(0,-.16,.25,1.12,.19,white,.63);
    bar(0,-.16,.09,.94,.20,dark,.63);
  } else if(platform.id==='instagram'){
    ring(rounded(1.02,1.02,.28).map(([x,y])=>[x,y-.17]),rounded(.79,.79,.20).map(([x,y])=>[x,y-.17]),.18,.1,gold);
    ring(circle(0,-.17,.27),circle(0,-.17,.17),.21,.09,white);
    prism(circle(.30,.13,.065),.21,.08,white);
  } else {
    const note=(dx,dy,z,mat)=>{
      bar(.13+dx,-.03+dy,.16,.83,z,mat);
      prism([[.05+dx,.38+dy],[.21+dx,.38+dy],[.26+dx,.20+dy],[.49+dx,.10+dy],[.49+dx,-.06+dy],[.23+dx,.02+dy]],z,.09,mat);
      ring(circle(-.09+dx,-.43+dy,.29,.25),circle(-.09+dx,-.43+dy,.13,.105),z,.10,mat);
    };
    note(-.06,.025,.14,cyan);note(.055,-.025,.20,pink);note(0,0,.25,white);
  }
  // Subtle raised bars create an engraved edition detail near the foot of the plaque.
  for(let i=0;i<5;i++)bar((i-2)*.12,-.79,.065,.035,.11,gold);
  const accessors=[],bufferViews=[];
  let offset=0;
  const add=(array)=>{const data=Buffer.from(new Float32Array(array).buffer);chunks.push(data);bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:34962});offset+=data.length;return bufferViews.length-1;};
  const pView=add(positions),nView=add(normals);
  const accessor=(view,values,start,count)=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=start*3;i<(start+count)*3;i++) {const a=i%3;min[a]=Math.min(min[a],values[i]);max[a]=Math.max(max[a],values[i]);}accessors.push({bufferView:view,byteOffset:start*12,componentType:5126,count,type:'VEC3',min,max});return accessors.length-1;};
  const meshes=primitives.map(p=>({primitives:[{attributes:{POSITION:accessor(pView,positions,p.start,p.count),NORMAL:accessor(nView,normals,p.start,p.count)},material:p.mat}]}));
  const document={asset:{version:'2.0',generator:'Vltstore original social badge generator'},scene:0,scenes:[{nodes:meshes.map((_,i)=>i)}],nodes:meshes.map((_,i)=>({mesh:i})),meshes,materials,accessors,bufferViews,buffers:[{byteLength:offset}]};
  let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  writeFileSync(`public/assets/models/${platform.id}-legend.glb`,Buffer.concat([header,json,binHeader,bin]));
}

const catalog=JSON.parse(readFileSync('data/catalog.json','utf8'));
const templatePath='data/storefront-template.html';
const $=load(readFileSync(existsSync(templatePath)?templatePath:'public/index.html','utf8'));
for(const p of platforms){
  model(p);
  const logo=p.id==='twitter'?'<path d="M83 60h22l70 94h-22zM173 60h-11l-79 94h11z"/>':p.id==='instagram'?'<rect x="83" y="62" width="90" height="90" rx="25" fill="none" stroke="white" stroke-width="9"/><circle cx="128" cy="107" r="22" fill="none" stroke="white" stroke-width="9"/><circle cx="154" cy="82" r="6"/>':'<path d="M137 59h17q2 24 27 27v17q-17-1-27-10v44q0 28-30 28t-30-26q0-29 31-30v18q-14 0-14 12t13 12q13 0 13-15z"/>';
  writeFileSync(`public/assets/${p.id}-legend.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 585 330"><defs><radialGradient id="g"><stop stop-color="${p.colour}" stop-opacity=".3"/><stop offset="1" stop-color="#05070b"/></radialGradient></defs><rect width="585" height="330" fill="url(#g)"/><g transform="translate(180 40) rotate(-6 128 120)"><rect x="42" y="10" width="174" height="230" rx="30" fill="#161b28" stroke="${p.colour}" stroke-width="3"/><g fill="white">${logo}</g><text x="128" y="207" text-anchor="middle" fill="${p.colour}" font-family="sans-serif" font-weight="bold" font-size="17">${p.label.toUpperCase()}</text></g></svg>`);
  if(p.id==='tiktok'){
    const imagePath='public/assets/tiktok-legend.svg';
    writeFileSync(imagePath,readFileSync(imagePath,'utf8').replaceAll(p.colour,'#000000').replaceAll('#161b28','#000000').replaceAll('#05070b','#000000'));
  }
  for(const [name,dollars] of p.names){const id=`${p.id}-${name}`, stats=socialStats[p.id]?.[name]||[], priceCents=socialPrice(p.id,stats,dollars);const existing=catalog.find(item=>item.id===id);if(existing){existing.description=[`${p.label} handle: @${name}`,...stats];existing.priceCents=priceCents;existing.active=true;}else catalog.push({id,name:`@${name}`,category:p.id,priceCents,tag:'OG',image:`/assets/${p.id}-legend.svg`,modelUrl:`/assets/models/${p.id}-legend.glb`,description:[`${p.label} handle: @${name}`,...stats],active:true});}
  if($(`#${p.id}`).length)continue;
  const section=$('#discord').clone().attr('id',p.id).addClass(`social-category social-${p.id}`);
  section.find('h2').first().text(`${p.label} Accounts`);
  section.find('input[type=search]').attr('placeholder',`Search ${p.label} usernames…`).attr('aria-label',`Search ${p.label} usernames`);
  section.find('[id]').each((_,el)=>{const element=$(el);element.attr('id',`${p.id}-${element.attr('id')}`);});
  section.find('[aria-controls],[aria-labelledby]').removeAttr('aria-controls').removeAttr('aria-labelledby');
  section.find('[role=tablist]').attr('aria-label',`${p.label} name categories`);
  section.find('[role=tab]').slice(2).remove();
  section.find('[data-load-more]').remove();
  section.find('[data-product]').slice(1).remove();
  const template=section.find('[data-product]').first().clone(),grid=section.find('[data-product]').first().parent();
  section.find('[data-product]').remove();
  for(const item of catalog.filter(item=>item.category===p.id)){
    const card=template.clone().attr({'data-product':item.id,'data-name':item.name,'data-price':item.priceCents,'data-tag':item.tag});
    card.find('h3').text(item.name);card.find('.text-green-500').text(`$${(item.priceCents/100).toLocaleString('en-US',{minimumFractionDigits:2})}`);
    card.find('img').attr({src:item.image,alt:`${p.label} metallic 3D badge`,loading:'lazy'}).parent().attr({'data-badge-model':item.modelUrl,'data-badge-tag':'OG'});
    card.find('ul').html(item.description.map(text=>`<li>${text}</li>`).join(''));
    card.find('[data-buy]').attr({'data-buy':item.id,href:`/checkout/${item.id}`}).prop('disabled',!item.active).attr('aria-disabled',String(!item.active)).text(item.active?'Buy now':'Unavailable');
    grid.find('.vlt-empty').before(card);
  }
  $('#reviews').before(section);
  for(const selector of ['nav .hidden.md\\:flex','#mobile-menu','footer ul']){
    const anchor=$(selector).find('a[href="/#hytale"]').first();
    if(anchor.length){const link=anchor.clone().attr('href',`/#${p.id}`).text(p.label);if(anchor.parent().is('li'))anchor.parent().after($('<li>').append(link));else anchor.after(link);}
  }
}
writeFileSync('data/catalog.json',JSON.stringify(catalog,null,2)+'\n');
// Keep navigation in the same order as the catalogue sections.
for(const container of ['nav .hidden.md\\:flex','#mobile-menu','footer ul']){
  let previous=$(container).find('a[href="/#hytale"]').first();
  for(const platform of platforms){
    const link=$(container).find(`a[href="/#${platform.id}"]`).first();
    if(previous.length&&link.length){if(previous.parent().is('li'))previous.parent().after(link.parent());else previous.after(link);previous=link;}
  }
}
$('title').text('Vltstore — Rare Discord, Minecraft & Social Accounts');
$('meta[name=description]').attr('content','Explore rare Discord, Minecraft, X / Twitter, Instagram and TikTok usernames at Vltstore.');
writeFileSync(templatePath,$.html());
const store=readFileSync('public/store.js','utf8')
  .replaceAll("['discord','minecraft','hytale'].includes(item.category)","['discord','minecraft','hytale','twitter','instagram','tiktok'].includes(item.category)")
  .replace("if(item.status==='sold'||item.status==='reserved'){a.textContent=item.status==='sold'?'Sold Out':'Reserved';", "if(!item.available){a.textContent=item.status==='sold'?'Sold Out':item.status==='reserved'?'Reserved':'Unavailable';");
writeFileSync('public/store.js',store);
console.log('Added social categories and original 3D meshes.');
