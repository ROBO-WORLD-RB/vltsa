const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const icons={BTC:'₿',ETH:'◆',LTC:'Ł',SOL:'◎',USDT:'₮',USDC:'$',DOGE:'Ð',TRX:'◈',XRP:'✕',TON:'◇'};
const colors={BTC:'#f7931a',ETH:'#627eea',LTC:'#345d9d',SOL:'#7a52ef',USDT:'#26a17b',USDC:'#2775ca',DOGE:'#c2a633',TRX:'#d73a49',XRP:'#60758c'};
function image(src){try{const url=new URL(src,location.origin);return url.origin===location.origin&&url.pathname.startsWith('/assets/')||url.protocol==='https:'?url.href:'/assets/vltstore.svg';}catch{return '/assets/vltstore.svg';}}
function shell(html){document.querySelector('main').innerHTML=html;window.scrollTo(0,0);}
async function json(url,options){const res=await fetch(url,options);const body=await res.json();if(!res.ok){const error=Error(body.error||'Unable to connect. Please try again.');error.orderToken=body.orderToken;throw error;}return body;}
function rememberOrder(token){try{sessionStorage.setItem('vltstore-order',token);}catch{/* Payment navigation must still work when browser storage is disabled. */}}

export async function checkout(id){
  shell('<div class="checkout-wrap"><p role="status">Loading checkout…</p></div>');
  try{
    const [catalog,methodsResponse]=await Promise.all([json('/api/catalog'),json('/api/payment-methods').catch(()=>({methods:[]}))]);
    const p=catalog.find(p=>p.id===id);
    if(!p){shell('<div class="checkout-wrap"><h1>Listing not found</h1><a href="/">Back to browse</a></div>');return;}
    document.title=p.name+' — Vltstore';
    const methods=methodsResponse.methods||[];
    const preferred=['BTC','ETH','LTC','SOL','USDT'];
    methods.sort((a,b)=>(preferred.includes(a.symbol)?preferred.indexOf(a.symbol):100)-(preferred.includes(b.symbol)?preferred.indexOf(b.symbol):100)||a.name.localeCompare(b.name));
    let selected=methods[0]?.symbol||'',network='',showAll=false;
    const badge=p.modelUrl?`data-badge-model="${escape(p.modelUrl)}" data-badge-tag="${escape(p.tag)}"`:'';
    shell(`<div class="checkout-wrap"><a class="checkout-back" href="/${escape(p.category)}">← <span>Back to Browse</span></a><div class="checkout-grid"><article class="checkout-card"><div class="checkout-badge-frame" ${badge}><img src="${escape(image(p.image))}" alt="${escape(p.name)}"></div><h1>${escape(p.name)}</h1><span class="checkout-price">${money(p.priceCents)}</span><p>${escape(p.tag||'')}</p><hr><h2>Product Details</h2><ul>${p.description.map(d=>'<li>'+escape(d)+'</li>').join('')}</ul></article><form id="checkout-form" class="checkout-card"><h2>Complete Your Purchase</h2><label for="email">Your Email <span style="color:#f87171">*</span></label><input type="email" id="email" name="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"><p class="checkout-hint">Your email is attached to your order for delivery and support</p><fieldset class="coin-fieldset"><legend>Payment Method <span style="color:#f87171">*</span></legend><div class="crypto-method"><div class="coin-method-title"><strong>Cryptocurrency</strong><span>OxaPay</span></div><div id="coin-options" role="radiogroup" aria-label="Cryptocurrency"></div><button type="button" id="more-coins" class="more-coins" ${methods.length>5?'':'hidden'}>More cryptocurrencies</button></div></fieldset><div id="network-control"></div><div class="checkout-total"><span>Total</span><strong>${money(p.priceCents)}</strong></div><button class="pay-button" type="submit" ${p.available?'':'disabled'}>${p.available?'Proceed to Payment':p.status==='sold'?'Sold Out':p.status==='reserved'?'Reserved':'Unavailable'}</button><p id="checkout-error" class="checkout-error" role="alert"></p><p id="payment-choice-summary" class="checkout-hint"></p></form></div></div>`);
    const form=document.querySelector('#checkout-form'),payButton=form.querySelector('[type=submit]');
    function selectCoin(symbol){selected=symbol;network='';renderChoices();}
    function renderChoices(){
      const current=methods.find(m=>m.symbol===selected);
      const container=document.querySelector('#coin-options');
      container.innerHTML=methods.filter((m,i)=>showAll||i<5||m.symbol===selected).map(m=>`<button type="button" role="radio" aria-checked="${m.symbol===selected}" data-coin="${escape(m.symbol)}" class="coin-option" tabindex="${m.symbol===selected?0:-1}"><span class="coin-icon" style="background:${colors[m.symbol]||'#546a86'}">${escape(icons[m.symbol]||m.symbol.slice(0,1))}</span><strong>${escape(m.symbol)}</strong><span class="coin-name">${escape(m.name)}</span><span class="coin-selected" aria-hidden="true">✓</span></button>`).join('');
      if(!container.querySelector('[tabindex="0"]'))container.querySelector('button')?.setAttribute('tabindex','0');
      container.querySelectorAll('[data-coin]').forEach(button=>{
        button.addEventListener('click',()=>{selectCoin(button.dataset.coin);container.querySelector(`[data-coin="${button.dataset.coin}"]`)?.focus();});
        button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...container.querySelectorAll('button')],i=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+buttons.length)%buttons.length;buttons[next].click();});
      });
      const networkControl=document.querySelector('#network-control');
      if(current){
        network=current.networks.some(n=>n.id===network)?network:current.networks[0].id;
        networkControl.innerHTML=`<label for="payment-network">Network</label><select id="payment-network" name="network">${current.networks.map(n=>`<option value="${escape(n.id)}" ${n.id===network?'selected':''}>${escape(n.name)}</option>`).join('')}</select>`;
        networkControl.querySelector('select').addEventListener('change',event=>{network=event.target.value;summary();});
      }else networkControl.innerHTML='';
      if(p.available){payButton.disabled=!current;payButton.textContent=current?'Pay with '+current.symbol:'Payments unavailable';}
      summary();
    }
    function summary(){const method=methods.find(m=>m.symbol===selected),chosen=method?.networks.find(n=>n.id===network);document.querySelector('#payment-choice-summary').textContent=method?`${method.name} · ${chosen?.name||''} · Secure payment powered by OxaPay`:'Cryptocurrency payments are temporarily unavailable. Please try again later.';}
    document.querySelector('#more-coins').addEventListener('click',event=>{showAll=!showAll;event.currentTarget.textContent=showAll?'Show fewer':'More cryptocurrencies';event.currentTarget.setAttribute('aria-expanded',String(showAll));renderChoices();});
    renderChoices();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!p.available||payButton.disabled)return;
      const error=document.querySelector('#checkout-error');error.textContent='';payButton.disabled=true;payButton.textContent='Creating secure payment…';
      try{
        const result=await json('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,email:form.elements.email.value,payCurrency:selected,network})});
        rememberOrder(result.token);
        history.pushState(null,'','/?order='+encodeURIComponent(result.token));await order(result.token,result);
      }catch(err){
        error.textContent=err.message;
        if(err.orderToken){rememberOrder(err.orderToken);const link=document.createElement('a');link.href='/?order='+encodeURIComponent(err.orderToken);link.textContent='View your order status';link.className='order-recovery';error.append(' ',link);}
        payButton.disabled=false;payButton.textContent='Pay with '+selected;
      }
    });
  }catch(error){shell(`<div class="checkout-wrap"><p role="alert">${escape(error.message)}</p><a class="checkout-back" href="/">← Back to store</a></div>`);}
}

export async function order(token,initial){
  document.title='Your order — Vltstore';
  shell('<div class="checkout-wrap order-panel"><section class="checkout-card"><h1>Your Vltstore order</h1><div id="order-content" role="status">Checking payment confirmation…</div><a class="checkout-back" href="/">← Back to store</a></section></div>');
  let timer,countdown,failures=0,refreshing=false;
  const messages={paid:'Your payment is confirmed. Your order is awaiting delivery.',pending:'Awaiting payment. This page updates automatically.',paying:'Payment detected. Waiting for blockchain confirmation.',underpaid:'A partial payment was received. Keep this order link; your payment needs review.',refunding:'Your payment is being refunded.',refunded:'Your payment has been refunded.',expired:'This payment invoice has expired.',failed:'This payment could not be completed.',invoice_unknown:'We are checking your payment session. Keep this order link and avoid sending a second payment.',creating:'Your payment session is being prepared.'};
  function draw(body){
    const target=document.getElementById('order-content');if(!target)return;
    const open=['pending','paying'].includes(body.status),usable=open&&body.expiresAt>Date.now();
    const p=usable?body.payment:null;
    target.innerHTML=`<div class="price-row"><strong>${escape(body.name)}</strong><strong>${money(body.amountCents)}</strong></div><p class="order-status">${escape(body.status==='pending'?'Awaiting payment':body.status)}</p><p class="status-description">${messages[body.status]||'Your order is being processed.'}</p>${p?`<div class="payment-instructions"><h2>Send exactly</h2><div class="payment-amount"><strong>${escape(p.amount)} ${escape(p.currency)}</strong><button type="button" data-copy="amount" aria-label="Copy payment amount">Copy</button></div><p class="payment-network">${escape(p.network)} only</p><div class="payment-address-box"><img class="payment-qr" src="/api/orders/${encodeURIComponent(token)}/qr.svg" alt="Payment wallet address QR code" width="220" height="220"><div class="payment-address-fields"><label>Wallet address</label><code>${escape(p.address)}</code><button type="button" class="copy-address" data-copy="address">Copy address</button>${p.memo?`<label>Required memo / destination tag</label><code>${escape(p.memo)}</code><button type="button" data-copy="memo">Copy memo</button>`:''}<p id="payment-countdown" class="checkout-hint"></p></div></div><p class="checkout-hint">Send ${escape(p.currency)} using ${escape(p.network)}. The QR code contains the wallet address; enter the exact amount shown above.${p.memo?' Include the required memo / destination tag.':''}</p></div>`:''}${open&&!usable?'<p class="checkout-error">This payment address has expired. Do not send funds. Checking the final payment status…</p>':''}<p class="order-token">Order reference: ${escape(token)}</p><button type="button" class="refresh-payment">Refresh payment status</button><p id="payment-feedback" class="checkout-hint" aria-live="polite"></p>`;
    target.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(p[button.dataset.copy]);document.querySelector('#payment-feedback').textContent='Copied to clipboard.';}catch{document.querySelector('#payment-feedback').textContent='Select the value above and copy it manually.';}}));
    target.querySelector('.refresh-payment').addEventListener('click',()=>refresh());
    clearInterval(countdown);
    if(p){const tick=()=>{const remaining=Math.max(0,Math.ceil((body.expiresAt-Date.now())/1000));const label=document.getElementById('payment-countdown');if(label)label.textContent=`Address expires in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;if(!remaining){clearInterval(countdown);draw(body);refresh();}};tick();countdown=setInterval(tick,1000);}
  }
  async function refresh(){
    if(refreshing)return;refreshing=true;clearTimeout(timer);
    try{const body=await json('/api/orders/'+encodeURIComponent(token));failures=0;draw(body);if(!['paid','expired','failed','refunded'].includes(body.status))timer=setTimeout(refresh,15000);}
    catch(err){const target=document.getElementById('payment-feedback')||document.getElementById('order-content');if(target)target.textContent=err.message;if(++failures<4)timer=setTimeout(refresh,15000);}
    finally{refreshing=false;}
  }
  window.addEventListener('pagehide',()=>{clearTimeout(timer);clearInterval(countdown);},{once:true});
  if(initial){draw(initial);timer=setTimeout(refresh,3000);}else await refresh();
}
