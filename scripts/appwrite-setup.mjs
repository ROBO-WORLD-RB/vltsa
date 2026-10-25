import 'dotenv/config';
import {appwriteStore} from '../order-store.mjs';
const store=appwriteStore(), db=process.env.APPWRITE_DATABASE_ID, orders=process.env.APPWRITE_ORDERS_COLLECTION_ID;
const base=`/tablesdb/${db}/tables`;
async function ensure(route,body){try{await store.request(route,'POST',body);}catch(e){if(e.status!==409)throw e;}}
await ensure(`${base}/${orders}/columns/string`,{key:'token',size:64,required:false});
await ensure(`${base}/${orders}/columns/string`,{key:'payload',size:16384,required:false});
for(const [id,name] of [['reservations','Stock reservations'],['payment_events','Verified payment events']])await ensure(base,{tableId:id,name,permissions:[],rowSecurity:true});
for(const [table,key,size] of [['reservations','orderId',36],['reservations','productId',128],['payment_events','digest',64],['payment_events','orderId',36],['payment_events','status',32]])await ensure(`${base}/${table}/columns/string`,{key,size,required:true});
await ensure(`${base}/payment_events/columns/integer`,{key:'receivedAt',required:true});
for(let attempt=0;attempt<20;attempt++){const schemas=await Promise.all([orders,'reservations','payment_events'].map(t=>store.request(`${base}/${t}/columns`)));if(schemas.every(s=>s.columns.every(c=>c.status==='available')))break;if(attempt===19)throw Error('Columns are still processing');await new Promise(r=>setTimeout(r,1000));}
for(const [key,type,columns] of [['order_token','unique',['token']],['order_status','key',['status']]])await ensure(`${base}/${orders}/indexes`,{key,type,columns});
console.log('Appwrite order, reservation and payment event schemas configured.');
