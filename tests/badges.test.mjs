import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('mobile 3D canvas stays card-local while scrolling, animating and resizing',()=>{
  const source=readFileSync(new URL('../public/badges.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  const frames=[], draws=[], copies=[], listeners={}, children=[];
  let rect={left:10,top:100,right:310,bottom:270,width:300,height:170};
  let connected=true,visible=true,observer;
  const card={dataset:{badgeModel:'/assets/model.glb'},get isConnected(){return connected;},getClientRects:()=>visible?[rect]:[],getBoundingClientRect:()=>rect,
    closest:()=>({addEventListener(){},contains:()=>false}),append:surface=>children.push(surface)};
  const makeCanvas=()=>({width:0,height:0,setAttribute(){},addEventListener(){},getContext:()=>({clearRect(){},drawImage:(...args)=>copies.push(args)}),remove(){}});
  vm.runInNewContext(source,{
    document:{hidden:false,createElement:makeCanvas,querySelector:()=>({}),querySelectorAll:()=>connected?[card]:[],addEventListener(){}},
    window:{addEventListener:(name,fn)=>{listeners[name]=fn;}},
    matchMedia:query=>({matches:query.includes('coarse'),addEventListener(){}}),
    devicePixelRatio:3,innerWidth:390,innerHeight:800,
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}},
    loadModel:()=>({ready:true}),createGridModelRenderer:()=>({clear(){},syncSize(){},releaseViews(){},drawModel:(view,x,y,w,h,dt,opacity,needs)=>{draws.push({hovered:view.hovered,x,y,w,h});needs[0]=true;return true;}})
  });
  frames.shift()(16);
  assert.equal(children.length,1);
  assert.equal(children[0].className,'product-badge-surface');
  assert.equal(draws[0].hovered,true,'Touch retains the live desktop hover animation');
  assert.equal(draws[0].w,450,'Mobile pixel density is capped');
  assert.ok(frames.length,'Animation schedules another frame');
  rect={...rect,top:-30,bottom:140};listeners.scroll();frames.shift()(32);
  assert.equal(children.length,1,'Scrolling keeps the same canvas in the card');
  assert.ok(draws.every(d=>d.x===0&&d.y===0),'Drawing never follows screen scroll coordinates');
  rect={...rect,width:340};listeners.resize();frames.shift()(48);
  assert.equal(children[0].width,510);
  visible=false;const count=draws.length;frames.shift()(64);assert.equal(draws.length,count,'Filtered cards stop rendering');
  connected=false;observer();frames.shift()(80);assert.equal(card.dataset.badgeReady,undefined);
  assert.ok(copies.length>=3,'Live rendered frames are copied into the card canvas');
});
