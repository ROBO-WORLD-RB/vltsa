import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function sqliteStore(dbPath) {
  const {DatabaseSync}=createRequire(import.meta.url || path.join(process.cwd(),'package.json'))('node:sqlite');
  if(dbPath!==':memory:')mkdirSync(path.dirname(dbPath),{recursive:true});
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, product_id TEXT NOT NULL,name TEXT NOT NULL,amount_cents INTEGER NOT NULL,email TEXT NOT NULL,status TEXT NOT NULL,track_id TEXT UNIQUE,payment_url TEXT,created_at INTEGER NOT NULL,expires_at INTEGER,paid_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_order ON orders(product_id) WHERE status NOT IN ('expired','failed');
    CREATE TABLE IF NOT EXISTS payment_events(digest TEXT PRIMARY KEY,order_id TEXT NOT NULL,status TEXT NOT NULL,received_at INTEGER NOT NULL);`);
  const columns=new Set(db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name));
  if(!columns.has('payment_type'))db.exec("ALTER TABLE orders ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'invoice'");
  if(!columns.has('payment_details'))db.exec('ALTER TABLE orders ADD COLUMN payment_details TEXT');
  const get=id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  return {kind:'sqlite',db, get, byToken:token=>db.prepare('SELECT * FROM orders WHERE token=?').get(token),
    held:()=>db.prepare("SELECT * FROM orders WHERE status NOT IN ('expired','failed')").all(),
    reserve(order){const keys=Object.keys(order);db.prepare(`INSERT INTO orders(${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>order[k]));},
    async mutate(id,fn){db.exec('BEGIN IMMEDIATE');try{const next=fn(get(id));const keys=Object.keys(next).filter(k=>k!=='id');db.prepare(`UPDATE orders SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...keys.map(k=>next[k]),id);db.exec('COMMIT');return get(id);}catch(e){db.exec('ROLLBACK');throw e;}},
    hasEvent:digest=>!!db.prepare('SELECT digest FROM payment_events WHERE digest=?').get(digest),
    event:(digest,id,status)=>db.prepare('INSERT OR IGNORE INTO payment_events VALUES (?,?,?,?)').run(digest,id,status,Date.now())};
}

export function appwriteStore(config={}) {
  const endpoint=(config.endpoint??process.env.APPWRITE_ENDPOINT??'https://fra.cloud.appwrite.io/v1').replace(/\/$/,'');
  const project=config.project??process.env.APPWRITE_PROJECT_ID;
  const key=config.key??process.env.APPWRITE_API_KEY;
  const database=config.database??process.env.APPWRITE_DATABASE_ID;
  const orders=config.orders??process.env.APPWRITE_ORDERS_COLLECTION_ID;
  const reservations=config.reservations??process.env.APPWRITE_RESERVATIONS_TABLE_ID??'reservations';
  const events=config.events??process.env.APPWRITE_EVENTS_TABLE_ID??'payment_events';
  if(!project||!key||!database||!orders)throw Error('Appwrite server configuration is incomplete');
  const fetcher=config.fetcher??fetch;
  async function request(route,method='GET',body){const response=await fetcher(endpoint+route,{method,headers:{'Content-Type':'application/json','X-Appwrite-Project':project,'X-Appwrite-Key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const text=await response.text();const result=text?JSON.parse(text):{};if(!response.ok){const error=Error(`Appwrite request failed (${response.status}): ${result.type??'unknown'}`);error.status=response.status;throw error;}return result;}
  const rows=table=>`/tablesdb/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/rows`;
  const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,36);
  const query=(method,attribute,values)=>JSON.stringify({method,attribute,values});
  const unpack=row=>row?(row.payload?JSON.parse(row.payload):{id:row.$id,product_id:row.productId,name:row.productName,amount_cents:row.amountCents,status:row.status,track_id:row.trackId||null,created_at:row.createdAt,legacy:true}):undefined;
  const pack=order=>({productId:order.product_id,productName:order.name,amountCents:order.amount_cents,status:order.status,trackId:order.track_id??'',createdAt:order.created_at,updatedAt:Date.now(),token:order.token,payload:JSON.stringify(order)});
  async function getRow(table,id,tx){try{return await request(rows(table)+'/'+encodeURIComponent(id)+(tx?'?transactionId='+encodeURIComponent(tx):''));}catch(e){if(e.status===404)return undefined;throw e;}}
  async function transaction(work){const tx=await request('/tablesdb/transactions','POST',{ttl:60});try{const result=await work(tx.$id);await request('/tablesdb/transactions/'+tx.$id,'PATCH',{commit:true});return result;}catch(e){await request('/tablesdb/transactions/'+tx.$id,'PATCH',{rollback:true}).catch(()=>{});throw e;}}
  async function list(table,queries=[]){const out=[];let cursor;do{const params=new URLSearchParams();for(const q of [...queries,JSON.stringify({method:'limit',values:[100]}),...(cursor?[JSON.stringify({method:'cursorAfter',values:[cursor]})]:[])])params.append('queries[]',q);const result=await request(rows(table)+'?'+params);out.push(...result.rows);cursor=result.rows.length===100?result.rows.at(-1).$id:null;}while(cursor);return out;}
  return {kind:'appwrite',request,rows,pack,transaction,
    get:async id=>unpack(await getRow(orders,id)),
    byToken:async token=>unpack((await list(orders,[query('equal','token',[token])]))[0]),
    held:async()=> (await list(orders,[query('notEqual','status',['expired']),query('notEqual','status',['failed'])])).map(unpack),
    reserve:order=>transaction(async tx=>{await request(rows(reservations),'POST',{rowId:hash(order.product_id),data:{orderId:order.id,productId:order.product_id},transactionId:tx});await request(rows(orders),'POST',{rowId:order.id,data:pack(order),transactionId:tx});}),
    async mutate(id,fn){for(let attempt=0;attempt<4;attempt++){try{return await transaction(async tx=>{const current=unpack(await getRow(orders,id,tx));if(!current)throw Error('Order not found');if(current.legacy)throw Error('Legacy mirror record requires recovery before modification');const next=fn(current);await request(rows(orders)+'/'+id,'PATCH',{data:pack(next),transactionId:tx});if(!['expired','failed'].includes(current.status)&&['expired','failed'].includes(next.status)){const lock=await getRow(reservations,hash(current.product_id),tx);if(lock?.orderId===id)await request(rows(reservations)+'/'+hash(current.product_id)+'?transactionId='+tx,'DELETE');}return next;});}catch(e){if(e.status!==409||attempt===3)throw e;}}},
    hasEvent:async digest=>!!await getRow(events,hash(digest)),
    async event(digest,id,status){try{await request(rows(events),'POST',{rowId:hash(digest),data:{digest,orderId:id,status,receivedAt:Date.now()}});}catch(e){if(e.status!==409)throw e;}},
    health:()=>request(`/tablesdb/${database}/tables/${orders}`)};
}
