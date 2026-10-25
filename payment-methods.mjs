import snapshot from './data/payment-currencies.json' with {type:'json'};

export function normalizeMethods(data,accepted){
  const allowed=accepted?new Set(accepted.map(s=>String(s).toUpperCase())):null;
  return Object.entries(data).filter(([symbol,c])=>c.status===true&&(!allowed||allowed.has(symbol.toUpperCase())))
    .map(([symbol,c])=>({symbol:symbol.toUpperCase(),name:c.name,
      networks:Object.entries(c.networks||{}).map(([key,n])=>({id:n.network||key,name:n.name||key,aliases:[key,n.network,n.name,...(n.keys||[])].filter(Boolean)}))}))
    .filter(c=>c.networks.length);
}
export function createPaymentMethods({apiKey,fetcher,methods}){
  let cached,until=0,pending;
  return async function getMethods(){
    if(methods)return methods;
    if(!apiKey)return normalizeMethods(snapshot);
    if(cached&&Date.now()<until)return cached;
    if(pending)return pending;
    pending=(async()=>{
      const [currencies,accepted]=await Promise.all([
        fetcher('https://api.oxapay.com/v1/common/currencies',{signal:AbortSignal.timeout(10000)}),
        fetcher('https://api.oxapay.com/v1/payment/accepted-currencies',{headers:{merchant_api_key:apiKey},signal:AbortSignal.timeout(10000)})
      ]);
      const [c,a]=await Promise.all([currencies.json(),accepted.json()]);
      if(!currencies.ok||!accepted.ok||c.status!==200||a.status!==200||!c.data||!Array.isArray(a.data?.list))throw Error('Payment methods unavailable');
      cached=normalizeMethods(c.data,a.data.list);until=Date.now()+300000;return cached;
    })();
    try{return await pending;}finally{pending=null;}
  };
}
