import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { createPaymentMethods } from './payment-methods.mjs';
import { sqliteStore, appwriteStore } from './order-store.mjs';
import bundledCatalog from './data/catalog.json' with {type:'json'};

const root = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
export function createApp(options = {}) {
  const apiKey = (options.apiKey ?? process.env.OXAPAY_MERCHANT_API_KEY ?? '').trim();
  const baseUrl = (options.baseUrl ?? process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const publicUrl = new URL(baseUrl);
  if (!['http:','https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password ||
      publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash)
    throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin without a path or credentials');
  const sandbox = options.sandbox ?? process.env.OXAPAY_SANDBOX === 'true';
  const fetcher = options.fetcher ?? fetch;
  const getPaymentMethods=createPaymentMethods({apiKey,fetcher,methods:options.paymentMethods});
  const dbPath = options.dbPath ?? process.env.DATABASE_PATH ?? path.join(root, 'data', 'orders.sqlite');
  const store=options.store??(options.dbPath!==undefined||process.env.ORDER_STORE==='sqlite'?sqliteStore(dbPath):appwriteStore());
  if(process.env.NETLIFY&&store.kind!=='appwrite')throw Error('Netlify requires Appwrite order storage');
  function catalog() {
    const entries = options.catalog ?? (process.env.LAMBDA_TASK_ROOT ? bundledCatalog : JSON.parse(readFileSync(path.join(root, 'data', 'catalog.json'), 'utf8')));
    if (!Array.isArray(entries)) throw new Error('Catalog must be an array');
    return entries;
  }
  const orderById=id=>store.get(id);
  function publicOrder(order) {
    return { id: order.id, token: order.token, productId: order.product_id, name: order.name,
      amountCents: order.amount_cents, currency: 'USD', status: order.status,
      paymentUrl: ['pending','paying'].includes(order.status) ? order.payment_url : null,
      expiresAt: order.expires_at, fulfillment: order.status === 'paid' ? 'awaiting_delivery' : null,
      payment:order.payment_details&&['pending','paying'].includes(order.status)?JSON.parse(order.payment_details):null };
  }
  async function provider(endpoint, body) {
    const response = await fetcher(`https://api.oxapay.com/v1/payment/${endpoint}`, {
      method: body ? 'POST' : 'GET', headers: { merchant_api_key: apiKey, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok || result.error || result.status !== 200) {
      const error = new Error('Payment provider rejected request');
      error.definitive = response.status >= 400 && response.status < 500;
      throw error;
    }
    return result.data;
  }
  async function reconcile(order, trackId = order.track_id) {
    const info = await provider(encodeURIComponent(trackId));
    if (String(info.track_id) !== String(trackId) || info.order_id !== order.id ||
        String(info.currency).toUpperCase() !== 'USD' ||
        !Number.isFinite(Number(info.amount)) || Math.abs(Number(info.amount) * 100 - order.amount_cents) > 0.001 ||
        (info.type && info.type.replaceAll('-','_') !== order.payment_type)) throw new Error('Payment facts do not match order');
    const status = String(info.status).toLowerCase();
    // Only provider-confirmed terminal states release stock. Local time alone cannot prove an invoice was unpaid.
    const next = ({ paid:'paid',manual_accept:'paid',paying:'paying',underpaid:'underpaid',
      refunding:'refunding',refunded:'refunded',expired:'expired',failed:'failed',new:'pending',waiting:'pending' })[status];
    if(!next)throw new Error('Unrecognized payment state');
    return store.mutate(order.id,latest=>{
    // Ignore stale updates, while allowing a verified refund after payment.
    if(latest.status==='refunded'||latest.status==='refunding'&&next!=='refunded'||
      latest.status==='paid'&&!['refunding','refunded'].includes(next))return latest;
    if(latest.track_id&&latest.track_id!==String(trackId))throw Error('Conflicting invoice identity');
    return {...latest,status:next,track_id:latest.track_id??String(trackId),paid_at:next==='paid'?(latest.paid_at??Date.now()):latest.paid_at};
    });
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next) => {
    res.set({ 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'X-Frame-Options':'DENY', 'Cache-Control':req.path.startsWith('/api/') ? 'no-store' : 'no-cache' });
    next();
  });
  app.post('/api/webhooks/oxapay', express.raw({type:'application/json',limit:'64kb'}), async (req,res) => {
    if (!apiKey || !Buffer.isBuffer(req.body)) return res.status(400).send('Invalid callback');
    const signature = req.get('hmac') ?? '';
    const expected = createHmac('sha512',apiKey).update(req.body).digest();
    if (!/^[a-f0-9]{128}$/i.test(signature) || !timingSafeEqual(expected,Buffer.from(signature,'hex')))
      return res.status(401).send('Invalid signature');
    try {
      const event = JSON.parse(req.body.toString('utf8'));
      const order = await orderById(event.order_id);
      if (!order || !event.track_id || (order.track_id && String(event.track_id)!==order.track_id) ||
          (event.type && event.type.replaceAll('-','_')!==order.payment_type)) return res.status(400).send('Unknown invoice');
      const digest = createHmac('sha256', apiKey).update(req.body).digest('hex');
      if (await store.hasEvent(digest)) return res.send('ok');
      const updated = await reconcile(order, String(event.track_id));
      await store.event(digest,order.id,updated.status);
      return res.send('ok');
    } catch { return res.status(503).send('Payment verification pending'); }
  });
  app.use('/api', express.json({limit:'8kb'}));
  app.get('/api/health', async(req,res) => {try{if(store.health)await store.health();res.json({ok:true,paymentsConfigured:!!apiKey,orderStore:store.kind,sandbox});}catch{res.status(503).json({ok:false,orderStore:store.kind});}});
  app.get('/api/payment-methods',async(req,res)=>{
    try{res.json({methods:await getPaymentMethods()});}
    catch{res.status(503).json({error:'Payment methods are temporarily unavailable. Please try again.'});}
  });
  app.get('/api/catalog', async(req,res,next) => {
    try {
      const held = new Map((await store.held()).map(o=>[o.product_id,o.status]));
      res.json(catalog().map(p=>({id:p.id,name:p.name,category:p.category,priceCents:p.priceCents,
        image:typeof p.image==='string' && (/^\/assets\/[a-z0-9_./-]+$/i.test(p.image) && !p.image.includes('..') || /^https:\/\//i.test(p.image)) ? p.image : null,
        description:Array.isArray(p.description) ? p.description.filter(line=>typeof line==='string').slice(0,20) : [],
        tag:typeof p.tag==='string' ? p.tag : '',
        modelUrl:typeof p.modelUrl==='string' && /^\/assets\/models\/[a-z0-9_-]+\.glb$/i.test(p.modelUrl) ? p.modelUrl : null,
        active:p.active===true,available:p.active===true&&!held.has(p.id),
        status:held.get(p.id)==='paid'?'sold':held.has(p.id)?'reserved':p.active===true?'available':'unavailable'})));
    } catch(e) { next(e); }
  });
  app.post('/api/checkout', rateLimit({windowMs:60000,limit:8,standardHeaders:'draft-8',legacyHeaders:false}), async (req,res) => {
    if (!apiKey) return res.status(503).json({error:'Payments are temporarily unavailable. Please try again later.'});
    if (!sandbox && (publicUrl.protocol!=='https:' || /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])|\.localhost$|\.local$/i.test(publicUrl.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(publicUrl.hostname)))
      return res.status(503).json({error:'Live checkout requires a public HTTPS address.'});
    if (req.get('origin') && req.get('origin') !== publicUrl.origin) return res.status(403).json({error:'Invalid checkout origin.'});
    const {productId,email,payCurrency,network} = req.body ?? {};
    if (typeof productId!=='string' || typeof email!=='string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({error:'Select a product and enter a valid email address.'});
    let method,selectedNetwork;
    if(payCurrency!==undefined){
      if(typeof payCurrency!=='string'||typeof network!=='string')return res.status(400).json({error:'Select a cryptocurrency and network.'});
      if(sandbox)return res.status(409).json({error:'Cryptocurrency payments are temporarily unavailable. Please try again later.'});
      try{method=(await getPaymentMethods()).find(m=>m.symbol===payCurrency);selectedNetwork=method?.networks.find(n=>n.id===network);}
      catch{return res.status(503).json({error:'Payment methods are temporarily unavailable. Please try again.'});}
      if(!method||!selectedNetwork)return res.status(400).json({error:'This cryptocurrency or network is not accepted.'});
    }
    let product;
    try { product = catalog().find(p=>p.id===productId && p.active===true); }
    catch { return res.status(503).json({error:'Inventory is temporarily unavailable.'}); }
    if (!product || !Number.isSafeInteger(product.priceCents) || product.priceCents<100)
      return res.status(409).json({error:'This listing is currently unavailable for purchase.'});
    // Refresh an expired-looking reservation from the provider before deciding whether it is safe to sell again.
    const held = (await store.held()).find(o=>o.product_id===product.id);
    if (held?.track_id && held.status!=='paid' && held.expires_at && held.expires_at<Date.now()) {
      try { await reconcile(held); } catch { /* Hold safely until provider confirmation. */ }
    }
    if(held&&!['expired','failed'].includes((await store.get(held.id))?.status))return res.status(409).json({error:'This listing is already reserved or sold.'});
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    try {
      await store.reserve({id,token,product_id:product.id,name:product.name,amount_cents:product.priceCents,email,status:'creating',created_at:Date.now(),payment_type:method?'white_label':'invoice',track_id:null,payment_url:null,payment_details:null,expires_at:null,paid_at:null});
    } catch(e) { return res.status(e.status&&e.status!==409?503:409).json({error:e.status&&e.status!==409?'Order storage is temporarily unavailable.':'This listing is already reserved or sold.'}); }
    try {
      const invoice = await provider(method?'white-label':'invoice', { amount:product.priceCents/100,currency:'USD',lifetime:60,
        under_paid_coverage:0,fee_paid_by_payer:0,auto_withdrawal:false,
        order_id:id,email,description:`Vltstore — ${product.name}`,
        callback_url:`${baseUrl}/api/webhooks/oxapay`,
        ...(method?{pay_currency:method.symbol,network:selectedNetwork.id}:{mixed_payment:false,sandbox,return_url:`${baseUrl}/?order=${token}`}) });
      if(!invoice.track_id||!Number.isFinite(Number(invoice.expired_at))||Number(invoice.expired_at)*1000<=Date.now())throw Error('Invalid payment expiry');
      let paymentUrl=null,details=null;
      if(method){
        const returnedNetwork=String(invoice.network);
        if(String(invoice.pay_currency).toUpperCase()!==method.symbol||
          !selectedNetwork.aliases.some(alias=>alias.toLowerCase()===returnedNetwork.toLowerCase())||
          String(invoice.currency).toUpperCase()!=='USD'||Math.abs(Number(invoice.amount)*100-product.priceCents)>.001||
          !Number.isFinite(Number(invoice.amount))||!Number.isFinite(Number(invoice.pay_amount))||Number(invoice.pay_amount)<=0||
          typeof invoice.address!=='string'||!invoice.address||invoice.address.length>512||/[\x00-\x1f]/.test(invoice.address)||
          (invoice.memo!=null&&(typeof invoice.memo!=='string'||invoice.memo.length>256)))throw Error('Invalid payment details');
        details=JSON.stringify({currency:method.symbol,network:selectedNetwork.name,networkId:selectedNetwork.id,
          amount:String(invoice.pay_amount),address:invoice.address,memo:invoice.memo||''});
      }else{
        const url = new URL(invoice.payment_url);
        if(url.protocol!=='https:'||(url.hostname!=='oxapay.com'&&!url.hostname.endsWith('.oxapay.com'))||url.username||url.password)throw Error('Invalid payment invoice');
        paymentUrl=url.href;
      }
      const savedOrder=await store.mutate(id,current=>{if(current.track_id&&current.track_id!==String(invoice.track_id))throw Error('Conflicting invoice identity');return {...current,track_id:String(invoice.track_id),payment_url:paymentUrl,payment_details:details,expires_at:Number(invoice.expired_at)*1000,status:current.status==='creating'?'pending':current.status};});
      res.status(201).json(publicOrder(savedOrder));
    } catch(e) {
      // A timeout may have created an invoice: retain this reservation to prevent two buyers paying for one name.
      await store.mutate(id,current=>({...current,status:current.status==='creating'?(e.definitive?'failed':'invoice_unknown'):current.status})).catch(()=>{});
      res.status(502).json({error:'Unable to start checkout. Please contact support before retrying.',orderToken:token});
    }
  });
  app.get('/api/orders/:token/qr.svg',async(req,res)=>{
    if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.status(404).end();
    const order=await store.byToken(req.params.token);
    if(!order?.payment_details||!['pending','paying'].includes(order.status)||order.expires_at<=Date.now())return res.status(404).end();
    try{res.type('svg').send(await QRCode.toString(JSON.parse(order.payment_details).address,{type:'svg',margin:2,width:240,errorCorrectionLevel:'M'}));}
    catch{res.status(503).end();}
  });
  app.get('/api/orders/:token', rateLimit({windowMs:60000,limit:90,standardHeaders:'draft-8',legacyHeaders:false}), async(req,res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({error:'Order not found.'});
    let order = await store.byToken(req.params.token);
    if (!order) return res.status(404).json({error:'Order not found.'});
    // Webhooks remain the primary update path; order polling also repairs a missed callback.
    if (apiKey && order.track_id && !['paid','expired','failed','refunded'].includes(order.status)) {
      try { order = await reconcile(order); } catch { /* Preserve last verified state. */ }
    }
    res.json(publicOrder(order));
  });
  app.use('/api', (req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.get(['/discord','/minecraft','/hytale','/twitter','/instagram','/tiktok'], (req,res)=>
    res.sendFile(path.join(root,'public','pages',req.path.slice(1)+'.html')));
  app.use(express.static(path.join(root,'public')));
  app.get('/checkout/:id', (req,res)=>res.sendFile(path.join(root,'public','index.html')));
  app.use((error,req,res,next)=>res.status(error.status===400?400:500).json({error:error.status===400?'Invalid request.':'Something went wrong.'}));
  app.locals.db=store.db;
  app.locals.store=store;
  app.locals.reconcile=reconcile;
  return app;
}
if (import.meta.url && process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port,process.env.HOST ?? '127.0.0.1',()=>console.log(`Vltstore: http://localhost:${port}`));
}
