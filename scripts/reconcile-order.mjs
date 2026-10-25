import {createApp} from '../server.mjs';
// Operator recovery only: find an uncertain invoice's track ID in the OxaPay merchant dashboard.
// The provider must confirm the order ID, expected USD amount, invoice type and track ID before binding.
const [orderId,trackId]=process.argv.slice(2);
if(!orderId||!trackId||!process.env.OXAPAY_MERCHANT_API_KEY) {
  console.error('Usage: node scripts/reconcile-order.mjs ORDER_ID OXAPAY_TRACK_ID (requires server .env)');
  process.exitCode=1;
} else {
  const app=createApp();
  try {
    const order=await app.locals.store.get(orderId);
    if(!order) throw new Error('Order not found');
    if(order.track_id && order.track_id!==trackId) throw new Error('Track ID conflicts with stored invoice');
    const updated=await app.locals.reconcile(order,trackId);
    console.log(`Order ${updated.id}: ${updated.status}`);
  } catch(error) {
    console.error(error.message);
    process.exitCode=1;
  } finally {app.locals.db?.close();}
}
