import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {appwriteStore} from '../order-store.mjs';
import {createApp} from '../server.mjs';
const store=appwriteStore(), product='integration-'+randomUUID();
const make=()=>({id:randomUUID(),token:randomBytes(32).toString('hex'),product_id:product,name:'Integration test',amount_cents:100,email:'test@example.invalid',status:'creating',created_at:Date.now(),payment_type:'invoice',track_id:null,payment_url:null,payment_details:null,expires_at:null,paid_at:null});
const a=make(),b=make(), digest=randomBytes(32).toString('hex');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,36);
let apiOrder,server;
try{
  console.log('Table:',(await store.health()).name);
  const outcomes=await Promise.allSettled([store.reserve(a),store.reserve(b)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1,'Exactly one concurrent reservation must succeed');
  const winner=outcomes[0].status==='fulfilled'?a:b;
  assert.equal((await appwriteStore().get(winner.id)).token,winner.token,'Independent instance reads persisted order');
  assert.equal((await store.byToken(winner.token)).id,winner.id);
  await store.mutate(winner.id,o=>({...o,status:'pending',track_id:'integration-track'}));
  await store.event(digest,winner.id,'pending');await store.event(digest,winner.id,'pending');assert.ok(await store.hasEvent(digest));
  await store.mutate(winner.id,o=>({...o,status:'expired'}));
  const replacement=outcomes[0].status==='fulfilled'?b:a;
  await store.reserve(replacement);
  await store.mutate(replacement.id,o=>({...o,status:'failed'}));
  console.log('PASS concurrent reservation, durable reads, token lookup, status updates, event idempotency, terminal reservation release.');
  let providerStatus='New';
  const app=createApp({store,apiKey:'integration-only',sandbox:true,catalog:[{id:product,name:'Integration test',priceCents:100,active:true}],fetcher:async(url,options)=>{
    if(options.method==='POST'){apiOrder=JSON.parse(options.body).order_id;return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'integration-api',payment_url:'https://pay.oxapay.com/integration',expired_at:Math.floor(Date.now()/1000)+3600}})};}
    return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'integration-api',order_id:apiOrder,amount:1,currency:'USD',type:'invoice',status:providerStatus}})};
  }});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  const checkout=await fetch(base+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:product,email:'test@example.invalid'})});assert.equal(checkout.status,201);const order=await checkout.json();
  providerStatus='Paid';const body=JSON.stringify({order_id:order.id,track_id:'integration-api',type:'invoice'});
  for(let i=0;i<2;i++){const result=await fetch(base+'/api/webhooks/oxapay',{method:'POST',headers:{'Content-Type':'application/json',hmac:createHmac('sha512','integration-only').update(body).digest('hex')},body});assert.equal(result.status,200);}
  assert.equal((await (await fetch(base+'/api/orders/'+order.token)).json()).status,'paid');
  providerStatus='Expired';assert.equal((await app.locals.reconcile(await store.get(order.id))).status,'paid');
  console.log('PASS real Appwrite checkout, signed webhook, replay, public order lookup and paid-state protection (mocked OxaPay only).');
  const eventDigest=createHmac('sha256','integration-only').update(body).digest('hex');await store.request(store.rows('payment_events')+'/'+hash(eventDigest),'DELETE');
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const [table,id] of [[process.env.APPWRITE_ORDERS_COLLECTION_ID,a.id],[process.env.APPWRITE_ORDERS_COLLECTION_ID,b.id],...(apiOrder?[[process.env.APPWRITE_ORDERS_COLLECTION_ID,apiOrder]]:[]),['payment_events',hash(digest)],['reservations',hash(product)]]){
    try{await store.request(store.rows(table)+'/'+id,'DELETE');}catch(e){if(e.status!==404)throw e;}
  }
  console.log('Removed integration test records.');
}
