import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from '../server.mjs';
import {createPaymentMethods} from '../payment-methods.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const product = {id:'owned-name',name:'OwnedName',priceCents:15000,category:'Discord',active:true};
async function fixture(t, options={}) {
  const calls=[];
  let providerInfo;
  const app=createApp({apiKey:'test-secret',sandbox:true,baseUrl:'http://localhost:3000',dbPath:':memory:',catalog:[product],
    fetcher:async(url,opts)=>{
      calls.push({url,opts});
      if (opts.method==='POST') {
        const request=JSON.parse(opts.body);
        providerInfo={track_id:'track-123',order_id:request.order_id,amount:150,currency:'USD',status:'New',type:'invoice'};
        return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'track-123',payment_url:'https://pay.oxapay.com/123',expired_at:Math.floor(Date.now()/1000)+3600}})};
      }
      return {ok:true,status:200,json:async()=>({status:200,data:providerInfo})};
    },...options});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let closed=false;
  async function close(){if(closed)return;closed=true;await new Promise(resolve=>server.close(resolve));app.locals.db.close();}
  t.after(close);
  return {app,calls,base,close,setInfo:changes=>Object.assign(providerInfo,changes),
    checkout:(body={productId:product.id,email:'buyer@example.com'})=>fetch(`${base}/api/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
    callback:async(event,valid=true)=>{
      const body=JSON.stringify(event);
      return fetch(`${base}/api/webhooks/oxapay`,{method:'POST',headers:{'Content-Type':'application/json',hmac:valid?createHmac('sha512','test-secret').update(body).digest('hex'):'0'.repeat(128)},body});
    }};
}
test('checkout uses catalog price and uniquely reserves stock',async t=>{
  const f=await fixture(t);
  const response=await f.checkout({productId:product.id,email:'buyer@example.com',amount:1,priceCents:1});
  assert.equal(response.status,201);
  const order=await response.json();
  assert.equal(order.amountCents,15000);
  assert.equal(JSON.parse(f.calls[0].opts.body).amount,150);
  assert.equal(JSON.parse(f.calls[0].opts.body).sandbox,true);
  assert.equal((await f.checkout()).status,409);
  const catalog=await (await fetch(`${f.base}/api/catalog`)).json();
  assert.equal(catalog[0].available,false);
  assert.equal(order.email,undefined);
});
test('missing key and preview catalog never call OxaPay',async t=>{
  const f=await fixture(t,{apiKey:''});
  assert.equal((await f.checkout()).status,503);
  assert.equal(f.calls.length,0);
  const preview=await fixture(t,{catalog:[{...product,active:false}]});
  assert.equal((await preview.checkout()).status,409);
  assert.equal(preview.calls.length,0);
});
test('reject forged webhook, reconcile paid, and replay idempotently',async t=>{
  const f=await fixture(t);
  const order=await (await f.checkout()).json();
  const event={track_id:'track-123',order_id:order.id,status:'Paid',type:'invoice',currency:'BTC'};
  assert.equal((await f.callback(event,false)).status,401);
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'pending');
  f.setInfo({status:'Paid'});
  assert.equal(await (await f.callback(event)).text(),'ok');
  assert.equal(await (await f.callback(event)).text(),'ok');
  assert.equal(f.app.locals.db.prepare('SELECT count(*) AS n FROM payment_events').get().n,1);
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'paid');
  f.setInfo({status:'Expired'});
  assert.equal(await (await f.callback({...event,status:'Expired'})).text(),'ok');
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'paid');
});
test('signed callback cannot override authoritative amount or wrong invoice identity',async t=>{
  const f=await fixture(t);
  const order=await (await f.checkout()).json();
  const event={track_id:'track-123',order_id:order.id,status:'Paid',type:'invoice'};
  f.setInfo({status:'Paid',amount:1});
  assert.equal((await f.callback(event)).status,503);
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'pending');
  assert.equal((await f.callback({...event,track_id:'someone-else'})).status,400);
  f.setInfo({amount:150,currency:'EUR'});
  assert.equal((await f.callback(event)).status,503);
});
test('ambiguous invoice timeout preserves reservation',async t=>{
  const f=await fixture(t,{fetcher:async()=>{throw new Error('timeout');}});
  assert.equal((await f.checkout()).status,502);
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'invoice_unknown');
  assert.equal((await f.checkout()).status,409);
});
test('order tokens are opaque, public status excludes buyer email',async t=>{
  const f=await fixture(t);
  const order=await (await f.checkout()).json();
  assert.match(order.token,/^[a-f0-9]{64}$/);
  const publicOrder=await (await fetch(`${f.base}/api/orders/${order.token}`)).json();
  assert.equal(publicOrder.email,undefined);
  assert.equal((await fetch(`${f.base}/api/orders/${order.id}`)).status,404);
});
test('catalog exposes only explicitly allowed presentation fields',async t=>{
  const f=await fixture(t,{catalog:[{...product,image:'/assets/example.png',description:['Safe description',42],tag:'Rare',password:'secret',deliveryCredentials:'secret'}]});
  const [item]=await(await fetch(`${f.base}/api/catalog`)).json();
  assert.equal(item.image,'/assets/example.png');
  assert.deepEqual(item.description,['Safe description']);
  assert.equal(item.tag,'Rare');
  assert.equal(item.password,undefined);
  assert.equal(item.deliveryCredentials,undefined);
});
test('invalid JSON and product types fail cleanly; live checkout rejects local origin',async t=>{
  const f=await fixture(t);
  assert.equal((await f.checkout({productId:{id:product.id},email:'buyer@example.com'})).status,400);
  const invalid=await fetch(`${f.base}/api/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(invalid.status,400);
  const live=await fixture(t,{sandbox:false,baseUrl:'https://localhost:3000'});
  assert.equal((await live.checkout()).status,503);
  assert.equal(live.calls.length,0);
});
test('early verified callback binds invoice without downgrading payment',async t=>{
  let f;
  f=await fixture(t,{fetcher:async(url,options)=>{
    if(options.method==='POST') {
      const request=JSON.parse(options.body);
      const response=await f.callback({order_id:request.order_id,track_id:'early-track',status:'Paid',type:'invoice'});
      assert.equal(response.status,200);
      return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'early-track',payment_url:'https://pay.oxapay.com/early',expired_at:Math.floor(Date.now()/1000)+3600}})};
    }
    const order=f.app.locals.db.prepare('SELECT id FROM orders').get();
    return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'early-track',order_id:order.id,amount:150,currency:'USD',status:'Paid',type:'invoice'}})};
  }});
  const response=await f.checkout();
  assert.equal(response.status,201);
  assert.equal((await response.json()).status,'paid');
  const order=f.app.locals.db.prepare('SELECT * FROM orders').get();
  assert.equal(order.track_id,'early-track');
  assert.equal(order.status,'paid');
});

const btcMethod={symbol:'BTC',name:'Bitcoin',networks:[{id:'Bitcoin',name:'Bitcoin Network',aliases:['Bitcoin','Bitcoin Network','BTC']}]};
test('coin and network selection creates a real white-label request and verifiable payment instructions',async t=>{
  let invoiceOrderId,paid=false;
  const f=await fixture(t,{sandbox:false,baseUrl:'https://vltstore.example',paymentMethods:[btcMethod],fetcher:async(url,options)=>{
    if(options.method==='POST'){
      assert.equal(url,'https://api.oxapay.com/v1/payment/white-label');
      const body=JSON.parse(options.body);invoiceOrderId=body.order_id;
      assert.equal(body.pay_currency,'BTC');assert.equal(body.network,'Bitcoin');assert.equal(body.currency,'USD');assert.equal(body.amount,150);
      assert.equal(body.sandbox,undefined);assert.equal(body.callback_url,'https://vltstore.example/api/webhooks/oxapay');
      return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'btc-track',currency:'USD',amount:150,pay_amount:.0015,pay_currency:'BTC',network:'Bitcoin Network',address:'bc1qtestaddress',memo:'',expired_at:Math.floor(Date.now()/1000)+3600}})};
    }
    return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'btc-track',order_id:invoiceOrderId,currency:'USD',amount:150,type:'white-label',status:paid?'Paid':'New'}})};
  }});
  const response=await f.checkout({productId:product.id,email:'buyer@example.com',payCurrency:'BTC',network:'Bitcoin',amount:1});
  assert.equal(response.status,201);const order=await response.json();
  assert.equal(order.paymentUrl,null);assert.deepEqual(order.payment,{currency:'BTC',network:'Bitcoin Network',networkId:'Bitcoin',amount:'0.0015',address:'bc1qtestaddress',memo:''});
  const qr=await fetch(`${f.base}/api/orders/${order.token}/qr.svg`);assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);
  assert.equal((await fetch(`${f.base}/api/orders/${'0'.repeat(64)}/qr.svg`)).status,404);
  paid=true;assert.equal((await f.callback({order_id:order.id,track_id:'btc-track',type:'white_label',status:'Paid'})).status,200);
  const confirmed=await(await fetch(`${f.base}/api/orders/${order.token}`)).json();assert.equal(confirmed.status,'paid');assert.equal(confirmed.payment,null);
  assert.equal((await fetch(`${f.base}/api/orders/${order.token}/qr.svg`)).status,404);
});

test('unsupported coin or network is rejected before stock is reserved',async t=>{
  const f=await fixture(t,{sandbox:false,baseUrl:'https://vltstore.example',paymentMethods:[btcMethod]});
  for(const choice of [{payCurrency:'BTC',network:'Ethereum'},{payCurrency:'FAKE',network:'Bitcoin'},{payCurrency:{symbol:'BTC'},network:'Bitcoin'}]){
    assert.equal((await f.checkout({productId:product.id,email:'buyer@example.com',...choice})).status,400);
  }
  assert.equal(f.calls.length,0);assert.equal(f.app.locals.db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
});

test('merchant currency settings restrict the displayed methods and cache provider reads',async()=>{
  const calls=[];const get=createPaymentMethods({apiKey:'test-secret',fetcher:async(url,options)=>{
    calls.push(url);
    return {ok:true,json:async()=>({status:200,data:url.includes('accepted-currencies')?{list:['LTC']}:{BTC:{name:'Bitcoin',status:true,networks:{Bitcoin:{network:'Bitcoin',name:'Bitcoin Network'}}},LTC:{name:'Litecoin',status:true,networks:{Litecoin:{network:'Litecoin',name:'Litecoin Network'}}}}})};
  }});
  assert.deepEqual((await get()).map(m=>m.symbol),['LTC']);await get();assert.equal(calls.length,2);
});

test('a white-label response for the wrong network never exposes an address',async t=>{
  const f=await fixture(t,{sandbox:false,baseUrl:'https://vltstore.example',paymentMethods:[btcMethod],fetcher:async()=>({ok:true,status:200,json:async()=>({status:200,data:{track_id:'bad-track',currency:'USD',amount:150,pay_amount:.0015,pay_currency:'BTC',network:'Ethereum',address:'untrusted-address',expired_at:Math.floor(Date.now()/1000)+3600}})})});
  const response=await f.checkout({productId:product.id,email:'buyer@example.com',payCurrency:'BTC',network:'Bitcoin'});
  assert.equal(response.status,502);const error=await response.json();assert.equal(error.payment,undefined);
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'invoice_unknown');
});

test('partial payments, manual acceptance and refunds retain accurate order states',async t=>{
  const f=await fixture(t);const order=await(await f.checkout()).json();
  const event={order_id:order.id,track_id:'track-123',type:'invoice'};
  for(const [providerStatus,expected] of [['Underpaid','underpaid'],['manual_accept','paid'],['Refunding','refunding'],['Refunded','refunded']]){
    f.setInfo({status:providerStatus});
    assert.equal((await f.callback({...event,status:providerStatus})).status,200);
    assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,expected);
    assert.equal((await f.checkout()).status,409);
  }
  f.setInfo({status:'Paid'});await f.callback({...event,status:'Paid'});
  assert.equal(f.app.locals.db.prepare('SELECT status FROM orders').get().status,'refunded');
  const response=await(await fetch(`${f.base}/api/orders/${order.token}`)).json();
  assert.equal(response.fulfillment,null);assert.equal(response.payment,null);
});

test('two simultaneous buyers cannot reserve the same listing',async t=>{
  const f=await fixture(t);const results=await Promise.all([f.checkout(),f.checkout()]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);
});

test('orders and reservations survive reopening the persistent database',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'vltstore-persistence-'));
  const dbPath=path.join(directory,'orders.sqlite');
  try{
    const first=await fixture(t,{dbPath});const order=await(await first.checkout()).json();await first.close();
    const second=await fixture(t,{dbPath,apiKey:''});
    const recovered=await(await fetch(`${second.base}/api/orders/${order.token}`)).json();
    assert.equal(recovered.id,order.id);assert.equal(recovered.status,'pending');
    const [item]=await(await fetch(`${second.base}/api/catalog`)).json();assert.equal(item.status,'reserved');
    await second.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});
