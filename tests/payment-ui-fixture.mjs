// Local, in-memory browser verification only. No requests reach OxaPay.
import {createApp} from '../server.mjs';
let paid=false,orderId;
const methods=[{symbol:'BTC',name:'Bitcoin',networks:[{id:'Bitcoin',name:'Bitcoin Network',aliases:['Bitcoin']}]},
  {symbol:'USDT',name:'Tether',networks:[{id:'Tron',name:'Tron Network',aliases:['Tron']}]}];
const app=createApp({apiKey:'local-fixture-key',baseUrl:'https://vltstore.example',sandbox:false,dbPath:':memory:',paymentMethods:methods,
  catalog:[{id:'checkout-verification',name:'Checkout verification',category:'discord',priceCents:1250,active:true,image:'/assets/vltstore.svg',description:['Local browser verification'],tag:'OG'}],
  fetcher:async(url,options)=>{
    if(options.method==='POST'){
      const request=JSON.parse(options.body);orderId=request.order_id;
      return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'ui-fixture',currency:'USD',amount:12.5,pay_amount:12.5,pay_currency:request.pay_currency,network:request.network,address:'LOCAL-TEST-ADDRESS-NOT-FOR-PAYMENTS',memo:'',expired_at:Math.floor(Date.now()/1000)+3600}})};
    }
    return {ok:true,status:200,json:async()=>({status:200,data:{track_id:'ui-fixture',order_id:orderId,type:'white_label',currency:'USD',amount:12.5,status:paid?'Paid':'New'}})};
  }});
// Browser's loopback Origin is allowed only by this isolated fixture.
app.request.get=function(name){if(name.toLowerCase()==='origin')return undefined;return this.header(name);};
app.post('/__test/confirm',(req,res)=>{paid=true;res.send('ok');});
app.listen(3001,'127.0.0.1',()=>console.log('Isolated payment UI fixture http://localhost:3001'));
