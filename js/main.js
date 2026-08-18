const BUSINESS_PHONE = '19297424202';
const BUSINESS_PHONE_DISPLAY = '(929) 742-4202';
const BUSINESS_EMAIL = 'islanddelicacy@outlook.com';
const DEFAULT_SIDES = ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta'];
const RASTA_SIDES = ['Steamed Cabbage', 'Sweet Plantains', 'Rice & Peas'];
const SIDE_ONLY_OPTIONS = ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta', 'Rice & Peas'];
const SIDE_ONLY_IDS = {
  'Steamed Cabbage':'side-steamed-cabbage',
  'Sweet Plantains':'side-sweet-plantains',
  'Rasta Pasta':'side-rasta-pasta',
  'Rice & Peas':'side-rice-and-peas'
};
const state = { item:null, sides:[], meat:false, qty:1, date:'', dateLabel:'', name:'', phone:'', note:'', cart:[], sideOnly:[], checkoutPending:false };

function laNow(){ return new Date(new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles' })); }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate()+days); return d; }
function fmtDate(d){ return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/Los_Angeles'}); }
function fullDate(d){ return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'}); }
function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function isRastaPasta(item){ return item?.category === 'Rasta Pasta'; }
function sidesFor(item){ return isRastaPasta(item) ? RASTA_SIDES : DEFAULT_SIDES; }
function meatPrice(kind){ return kind === 'oxtail' ? 12 : kind === 'meat' ? 10 : 0; }
function meatLabel(kind){ return kind === 'oxtail' ? 'extra oxtail' : kind === 'meat' ? 'extra meat' : ''; }
function currentPlateLine(){
  if(!plateValid()) return null;
  return {id:state.item.id, name:state.item.name, price:state.item.price, qty:state.qty, sides:[...state.sides], meat:state.meat, note:state.note.trim()};
}
function configuredPlateTotal(line){ return (line.price * line.qty) + meatPrice(line.meat); }
function committedPlateQuantity(){ return state.cart.reduce((sum,line)=>sum+line.qty,0); }
function totalOrderQuantity(){ return committedPlateQuantity() + (state.item ? state.qty : 0) + state.sideOnly.length; }
function clearCurrentPlate(){
  state.item=null; state.sides=[]; state.meat=false; state.qty=1; state.note='';
  const qty=document.querySelector('[data-qty-value]'); if(qty) qty.textContent='1';
  renderSides(); updateCustomize(); renderChoicesSelected();
}
function addCurrentPlate(){
  const line=currentPlateLine();
  if(!line) return;
  if(totalOrderQuantity()>30){ alert('Orders are limited to 30 total items for one pickup day.'); return; }
  state.cart.push(line);
  clearCurrentPlate();
  renderSummary();
  document.querySelector('[data-plate-choices]')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function checkoutApi(){
  const config=window.ISLAND_CHECKOUT || {};
  const sandbox=new URLSearchParams(location.search).get('sandbox')==='1';
  return sandbox && config.sandbox
    ? {url:config.sandbox, environment:'sandbox'}
    : config.production ? {url:config.production, environment:'production'} : null;
}

function safeSquareUrl(value, environment){
  try{
    const url=new URL(value);
    if(url.protocol!=='https:') return false;
    return environment==='sandbox'
      ? url.hostname==='sandbox.square.link'
      : url.hostname==='square.link' || url.hostname==='checkout.square.site';
  }catch(_error){ return false; }
}

function cutoffInfo(){
  const now = laNow();
  const cutoff = new Date(now); cutoff.setHours(10,0,0,0);
  const before10 = now < cutoff;
  const firstOffset = before10 ? 1 : 2;
  const earliest = addDays(now, firstOffset);
  const ms = Math.max(0, cutoff - now);
  const h = Math.floor(ms/36e5), m = Math.floor((ms%36e5)/6e4);
  return {now, before10, firstOffset, earliest, h, m};
}

function updateCutoff(){
  const info = cutoffInfo();
  const bar = document.querySelector('[data-cutoff-bar]');
  if(bar){
    bar.textContent = info.before10
      ? `Ordering open — ${info.h}h ${info.m}m left to order for tomorrow (closes 10:00 AM)`
      : `Today's 10 AM cutoff has passed — you're ordering for ${fmtDate(info.earliest)}`;
  }
  document.querySelectorAll('[data-earliest-label]').forEach(el => el.textContent = info.before10 ? 'tomorrow' : fmtDate(info.earliest));
  document.querySelectorAll('[data-cutoff-line]').forEach(el => el.textContent = info.before10 ? `Order in the next ${info.h}h ${info.m}m for tomorrow.` : `The 10 AM cutoff passed, so the earliest pickup is ${fmtDate(info.earliest)}.`);
}

function navInit(){
  const btn=document.querySelector('[data-menu-toggle]'), links=document.querySelector('.nav-links');
  if(!btn||!links) return;
  btn.addEventListener('click',()=>{ links.classList.toggle('open'); document.body.classList.toggle('menu-open', links.classList.contains('open')); });
}

function hydratePreviewCards(){
  const wrap=document.querySelector('[data-menu-preview]'); if(!wrap || !window.ISLAND_MENU) return;
  const featuredIds=['oxtail','jerk','curry-goat','brown-stew-chicken'];
  const featured=featuredIds.map(id=>window.ISLAND_MENU.find(item=>item.id===id)).filter(Boolean);
  wrap.innerHTML = featured.map(item => `<a class="plate-card" href="/order/" aria-label="Order ${escapeHtml(item.name)}"><figure><img src="${item.image}" alt="${escapeHtml(item.name)} plate" loading="lazy" width="1400" height="1400"><span class="chip">Limited daily</span></figure><div class="plate-body"><div class="plate-title">${escapeHtml(item.name)}</div><div class="plate-meta"><span>${escapeHtml(item.category)}</span><span>$${item.price}</span></div></div></a>`).join('');
}

function orderInit(){
  const root=document.querySelector('[data-order-app]'); if(!root || !window.ISLAND_MENU) return;
  const params=new URLSearchParams(location.search);
  if(params.get('confirmed')==='1' || params.get('paid')==='1'){
    const confirmation=document.querySelector('[data-confirmation]');
    confirmation?.classList.remove('hidden');
    try{
      const last=JSON.parse(sessionStorage.getItem('islandDelicacyLastOrder') || '{}');
      const message=confirmation?.querySelector('[data-confirmation-message]');
      if(message && last.phone) message.textContent=`Square checkout returned successfully. We'll text ${last.phone} on pickup day.`;
    }catch(_error){ /* Confirmation still renders without local recap data. */ }
  }
  if(params.get('sandbox')==='1' && window.ISLAND_CHECKOUT?.sandbox){
    root.insertAdjacentHTML('afterbegin','<div class="container"><div class="success"><strong>SANDBOX TEST MODE</strong><p>No real charge will be made. Use a Square Sandbox test card only.</p></div></div>');
  }
  const info=cutoffInfo(); const dates=[]; for(let i=0;i<5;i++) dates.push(addDays(info.now, info.firstOffset+i)); state.date=isoDate(dates[0]); state.dateLabel=fmtDate(dates[0]);
  renderChoices(); renderSides(); renderSideOnlyButtons(); renderDates(dates); bindInputs(); updateCustomize(); renderSummary();
}

function ensureMenuLightbox(){
  let overlay=document.querySelector('[data-menu-lightbox]');
  if(overlay) return overlay;
  document.body.insertAdjacentHTML('beforeend', `<div class="menu-lightbox" data-menu-lightbox hidden role="dialog" aria-modal="true" aria-label="Menu photo"><button type="button" class="lightbox-close" data-lightbox-close aria-label="Close enlarged photo">×</button><img data-lightbox-image alt=""><p data-lightbox-caption></p></div>`);
  overlay=document.querySelector('[data-menu-lightbox]');
  overlay.addEventListener('click',closeMenuLightbox);
  document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeMenuLightbox(); });
  return overlay;
}

function openMenuLightbox(item){
  if(!item?.image) return;
  const overlay=ensureMenuLightbox();
  const image=overlay.querySelector('[data-lightbox-image]');
  image.src=item.image;
  image.alt=`${item.name} plate`;
  overlay.querySelector('[data-lightbox-caption]').textContent=`${item.name} · tap anywhere to close`;
  overlay.hidden=false;
  document.body.classList.add('lightbox-open');
  overlay.querySelector('[data-lightbox-close]').focus();
}

function closeMenuLightbox(){
  const overlay=document.querySelector('[data-menu-lightbox]');
  if(!overlay || overlay.hidden) return;
  overlay.hidden=true;
  document.body.classList.remove('lightbox-open');
}

function renderChoices(){
  const wrap=document.querySelector('[data-plate-choices]');
  wrap.innerHTML = window.ISLAND_MENU.map(item => {
    const inclusion = isRastaPasta(item) ? 'rice & peas available as a side' : 'rice & peas included';
    return `<div class="choice" data-choice-item="${item.id}"><button type="button" class="plate-thumb" data-zoom-item="${item.id}" aria-label="Enlarge ${escapeHtml(item.name)} photo" title="Tap to enlarge"><img src="${item.image}" alt="" loading="lazy" width="64" height="64"></button><button type="button" class="choice-pick" data-item="${item.id}" title="${escapeHtml(inclusion)}"><span class="choice-title"><span>${escapeHtml(item.name)}</span><span>$${item.price}</span></span><span class="choice-meta"><small>${escapeHtml(item.category)}</small><span class="cap-chip">LIMITED DAILY</span></span></button></div>`;
  }).join('');
  wrap.addEventListener('click', e=>{
    const zoom=e.target.closest('[data-zoom-item]');
    if(zoom){
      e.preventDefault(); e.stopPropagation();
      openMenuLightbox(window.ISLAND_MENU.find(item=>item.id===zoom.dataset.zoomItem));
      return;
    }
    const btn=e.target.closest('[data-item]'); if(!btn) return;
    const nextItem=window.ISLAND_MENU.find(x=>x.id===btn.dataset.item);
    if(state.item?.id !== nextItem?.id) state.note='';
    state.item=nextItem;
    const allowed=sidesFor(state.item);
    state.sides=state.sides.filter(side=>allowed.includes(side));
    renderSides(); updateCustomize(); renderChoicesSelected(); renderSummary();
  });
}

function renderChoicesSelected(){
  document.querySelectorAll('[data-choice-item]').forEach(card=>card.classList.toggle('selected', state.item && card.dataset.choiceItem===state.item.id));
}

function renderSides(){
  const wrap=document.querySelector('[data-side-options]'); if(!wrap) return;
  const options=sidesFor(state.item);
  wrap.innerHTML=options.map(side=>{
    const image=window.SIDE_IMAGES?.[side] || '';
    return `<label class="side-option"><img src="${image}" alt="${escapeHtml(side)}" loading="lazy" width="150" height="96"><span class="side-option-check"><input type="checkbox" name="side" value="${escapeHtml(side)}" ${state.sides.includes(side)?'checked':''}><span>${escapeHtml(side)}</span></span></label>`;
  }).join('');
  wrap.querySelectorAll('[name="side"]').forEach(input=>input.addEventListener('change',()=>{
    const checked=[...wrap.querySelectorAll('[name="side"]:checked')];
    if(checked.length>2){ input.checked=false; alert('Pick exactly 2 sides.'); return; }
    state.sides=checked.map(x=>x.value); renderSummary();
  }));
  const note=document.querySelector('[data-sides-note]');
  if(note) note.textContent=isRastaPasta(state.item)
    ? "(rasta pasta plates don't include rice & peas — add it as a side)"
    : 'Rice & peas are always included.';
}

function updateCustomize(){
  const panel=document.querySelector('[data-customize]');
  const input=document.querySelector('[name="plateNote"]');
  const name=document.querySelector('[data-customize-name]');
  if(!panel || !input || !name) return;
  const selected=Boolean(state.item);
  panel.classList.toggle('hidden', !selected);
  input.disabled=!selected;
  input.value=state.note;
  name.textContent=state.item?.name || 'plate';
}

function renderSideOnlyButtons(){
  const wrap=document.querySelector('[data-side-only-options]'); if(!wrap) return;
  wrap.innerHTML=SIDE_ONLY_OPTIONS.map(side=>`<button type="button" class="toggle-chip" data-add-side="${side}">＋ ${side} — $5</button>`).join('');
  wrap.addEventListener('click',e=>{
    const button=e.target.closest('[data-add-side]'); if(!button) return;
    if(totalOrderQuantity()>=30){ alert('Orders are limited to 30 total items for one pickup day.'); return; }
    state.sideOnly.push(button.dataset.addSide);
    renderSummary();
  });
}

function renderDates(dates){
  const wrap=document.querySelector('[data-date-chips]');
  wrap.innerHTML = dates.map((d,i)=>`<button type="button" class="date-chip ${i===0?'selected':''}" data-date="${isoDate(d)}" data-date-label="${fmtDate(d)}" title="${fullDate(d)}">${fmtDate(d)}</button>`).join('');
  wrap.addEventListener('click',e=>{const b=e.target.closest('[data-date]'); if(!b) return; state.date=b.dataset.date; state.dateLabel=b.dataset.dateLabel; document.querySelectorAll('[data-date]').forEach(x=>x.classList.toggle('selected',x===b)); renderSummary();});
}

function bindInputs(){
  document.querySelectorAll('[data-meat]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.item) return;
    state.meat=state.meat===button.dataset.meat ? false : button.dataset.meat;
    renderSummary();
  }));
  document.querySelector('[name="plateNote"]')?.addEventListener('input',e=>{state.note=e.target.value.slice(0,200); renderSummary();});
  document.querySelector('[data-qty-minus]')?.addEventListener('click',()=>{state.qty=Math.max(1,state.qty-1); document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();});
  document.querySelector('[data-qty-plus]')?.addEventListener('click',()=>{
    const otherItems=committedPlateQuantity()+state.sideOnly.length;
    state.qty=Math.min(10,Math.max(1,30-otherItems),state.qty+1);
    document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();
  });
  document.querySelector('[data-add-plate]')?.addEventListener('click',addCurrentPlate);
  document.querySelector('[name="customerName"]')?.addEventListener('input',e=>{state.name=e.target.value.trim(); renderSummary();});
  document.querySelector('[name="customerPhone"]')?.addEventListener('input',e=>{state.phone=e.target.value.trim(); renderSummary();});
  document.querySelector('[data-summary-lines]')?.addEventListener('click',e=>{
    const sideButton=e.target.closest('[data-remove-side]');
    if(sideButton){ state.sideOnly.splice(Number(sideButton.dataset.removeSide),1); renderSummary(); return; }
    const plateButton=e.target.closest('[data-remove-plate]');
    if(plateButton){ state.cart.splice(Number(plateButton.dataset.removePlate),1); renderSummary(); return; }
    if(e.target.closest('[data-remove-current-plate]')){ clearCurrentPlate(); renderSummary(); }
  });
  document.querySelector('[data-checkout]')?.addEventListener('click', checkout);
}

function plateValid(){ return Boolean(state.item && state.sides.length===2); }
function valid(){
  const hasOrder=state.cart.length>0 || plateValid() || state.sideOnly.length>0;
  const currentPlateIsComplete=!state.item || plateValid();
  return hasOrder && currentPlateIsComplete && totalOrderQuantity()<=30 && state.date && state.name.length>1 && state.phone.length>6;
}
function plateTotal(){ return state.item ? configuredPlateTotal({price:state.item.price,qty:state.qty,meat:state.meat}) : 0; }
function total(){ return state.cart.reduce((sum,line)=>sum+configuredPlateTotal(line),0) + plateTotal() + state.sideOnly.length*5; }
function plateDetails(line){ return [...line.sides, meatLabel(line.meat), line.note?.trim()].filter(Boolean).map(escapeHtml).join(' · '); }

function renderSummary(){
  const lines=document.querySelector('[data-summary-lines]'), totalEl=document.querySelector('[data-total]'), btn=document.querySelector('[data-checkout]'); if(!lines) return;
  const orderLines=[];
  state.cart.forEach((line,index)=>{
    orderLines.push(`<div class="summary-line committed"><span class="summary-copy"><b>${line.qty} × ${escapeHtml(line.name)}</b><small>${plateDetails(line)}</small></span><span class="summary-action"><strong>$${configuredPlateTotal(line)}</strong><button type="button" data-remove-plate="${index}" aria-label="Remove ${escapeHtml(line.name)}">×</button></span></div>`);
  });
  if(state.item){
    const details=plateValid() ? plateDetails({sides:state.sides,meat:state.meat,note:state.note}) : `Choose 2 sides (${state.sides.length}/2)`;
    orderLines.push(`<div class="summary-line current"><span class="summary-copy"><b>${state.qty} × ${escapeHtml(state.item.name)}</b><small>${details}</small></span><span class="summary-action"><strong>$${plateTotal()}</strong><button type="button" data-remove-current-plate aria-label="Remove ${escapeHtml(state.item.name)}">×</button></span></div>`);
  }
  state.sideOnly.forEach((side,index)=>orderLines.push(`<div class="summary-line"><span class="summary-copy"><b>${escapeHtml(`Side · ${side}`)}</b></span><span class="summary-action"><strong>$5</strong><button type="button" data-remove-side="${index}" aria-label="Remove ${escapeHtml(side)}">×</button></span></div>`));
  if(orderLines.length===0) orderLines.push('<div class="summary-line"><span>Pick a plate or add sides</span><strong>—</strong></div>');
  orderLines.push(`<div class="summary-line"><span>Pickup date</span><strong>${escapeHtml(state.dateLabel || '—')}</strong></div>`);
  if(state.name) orderLines.push(`<div class="summary-line"><span>Name</span><strong>${escapeHtml(state.name)}</strong></div>`);
  lines.innerHTML=orderLines.join('');
  totalEl.textContent = `$${total()}`;
  document.querySelectorAll('[data-meat]').forEach(button=>{
    const active=state.meat===button.dataset.meat;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',String(active));
    button.disabled=!state.item;
  });
  const addPlateButton=document.querySelector('[data-add-plate]');
  if(addPlateButton){
    addPlateButton.disabled=!plateValid() || totalOrderQuantity()>30;
    addPlateButton.setAttribute('aria-disabled',String(addPlateButton.disabled));
  }
  const count=document.querySelector('[data-order-count]');
  if(count) count.textContent=`${committedPlateQuantity() + (state.item ? state.qty : 0)} of 30 plates for this pickup day`;
  const isValid=valid();
  const api=checkoutApi();
  const square=(window.SQUARE_LINKS && state.item && window.SQUARE_LINKS[state.item.id]) || '';
  const squareEligible=Boolean(square && state.cart.length===0 && plateValid() && state.sideOnly.length===0);
  btn.disabled=!isValid || state.checkoutPending;
  btn.textContent = state.checkoutPending
    ? 'CREATING SECURE CHECKOUT…'
    : !isValid ? 'FINISH THE STEPS ABOVE'
    : api?.environment==='sandbox' ? 'CONTINUE TO SQUARE SANDBOX →'
    : api ? 'CONTINUE TO SECURE SQUARE CHECKOUT →'
    : squareEligible ? 'CONTINUE TO SQUARE CHECKOUT →'
    : "TEXT ORDER — WE'LL SEND A PAYMENT LINK";
}

function smsOrderUrl(note){ return `sms:+${BUSINESS_PHONE}?&body=${encodeURIComponent(note)}`; }

function checkoutPayload(){
  const lines=state.cart.map(line=>({id:line.id,qty:line.qty,sides:[...line.sides],meat:line.meat,note:line.note}));
  const current=currentPlateLine();
  if(current) lines.push({id:current.id,qty:current.qty,sides:[...current.sides],meat:current.meat,note:current.note});
  const sideCounts={};
  state.sideOnly.forEach(side=>{ sideCounts[side]=(sideCounts[side]||0)+1; });
  Object.entries(sideCounts).forEach(([side,qty])=>lines.push({id:SIDE_ONLY_IDS[side],qty}));
  return {lines,date:state.date,name:state.name,phone:state.phone};
}

async function checkout(){
  if(!valid()) return;
  const orderLines=[];
  const allPlates=[...state.cart];
  const current=currentPlateLine(); if(current) allPlates.push(current);
  allPlates.forEach(line=>{
    const details=[`sides: ${line.sides.join(' + ')}`, meatLabel(line.meat), line.note ? `note: ${line.note}` : ''].filter(Boolean).join('; ');
    orderLines.push(`${line.qty} x ${line.name} (${details}) — $${configuredPlateTotal(line)}`);
  });
  state.sideOnly.forEach(side=>orderLines.push(`1 x Side · ${side} — $5`));
  const note=`Island Delicacy preorder:\n${orderLines.join('\n')}\nTotal: $${total()}\nPickup date: ${state.dateLabel}\nName: ${state.name}\nPhone: ${state.phone}\nWe'll text to set pickup time.`;
  const api=checkoutApi();
  if(api){
    state.checkoutPending=true; renderSummary();
    try{
      const response=await fetch(api.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checkoutPayload())});
      const data=await response.json().catch(()=>({}));
      if(!response.ok || !safeSquareUrl(data.url,api.environment)) throw new Error(data.error || 'Square checkout unavailable');
      sessionStorage.setItem('islandDelicacyLastOrder',JSON.stringify({phone:state.phone,date:state.date,name:state.name,orderId:data.orderId,environment:data.environment}));
      window.location.assign(data.url);
      return;
    }catch(_error){
      state.checkoutPending=false; renderSummary();
      alert("Square checkout isn't available right now, so we're opening a complete text order instead.");
      window.location.href=smsOrderUrl(note);
      return;
    }
  }
  const square = state.cart.length===0 && plateValid() && state.sideOnly.length===0 && window.SQUARE_LINKS ? window.SQUARE_LINKS[state.item.id] || '' : '';
  if(square){
    const sep=square.includes('?')?'&':'?';
    window.open(`${square}${sep}note=${encodeURIComponent(note)}&quantity=${state.qty}`,'_blank','noopener');
  } else {
    window.location.href = smsOrderUrl(note);
  }
}

function cateringInit(){
  const form=document.querySelector('[data-catering-form]'); if(!form) return;
  const dateInput=form.querySelector('[name="date"]');
  const datePicker=form.querySelector('[data-date-picker]');
  const sendOptions=form.querySelector('[data-catering-send-options]');
  const status=form.querySelector('[data-catering-status]');
  let preparedInquiry='';

  if(dateInput){
    dateInput.min=isoDate(addDays(laNow(),2));
    const openPicker=()=>{
      dateInput.focus({preventScroll:true});
      if(typeof dateInput.showPicker==='function'){
        try{ dateInput.showPicker(); }catch(_error){ dateInput.click(); }
      }else dateInput.click();
    };
    datePicker?.addEventListener('click', openPicker);
    dateInput.addEventListener('click',()=>{
      if(typeof dateInput.showPicker==='function'){
        try{ dateInput.showPicker(); }catch(_error){ /* Native input remains usable. */ }
      }
    });
  }

  form.addEventListener('submit', e=>{
    e.preventDefault();
    if(!form.reportValidity()) return;
    const data=new FormData(form);
    const subject='Island Delicacy catering inquiry';
    preparedInquiry=[
      `Catering inquiry from ${data.get('name')}`,
      `Phone/email: ${data.get('contact')}`,
      `Event date: ${data.get('date')}`,
      `Headcount: ${data.get('headcount') || 'Not provided'}`,
      '',
      data.get('message') || 'No additional message.'
    ].join('\n');
    const emailParams=`to=${encodeURIComponent(BUSINESS_EMAIL)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(preparedInquiry)}`;
    form.querySelector('[data-catering-sms]').href=smsOrderUrl(`Hi Island Delicacy,\n\n${preparedInquiry}`);
    form.querySelector('[data-catering-gmail]').href=`https://mail.google.com/mail/?view=cm&fs=1&${emailParams.replace('subject=','su=')}`;
    form.querySelector('[data-catering-outlook]').href=`https://outlook.live.com/mail/0/deeplink/compose?${emailParams}`;
    sendOptions.classList.remove('hidden');
    status.textContent='Choose an option above. Your details are prefilled for review.';
    sendOptions.scrollIntoView({behavior:'smooth',block:'nearest'});
  });

  form.querySelector('[data-catering-copy]')?.addEventListener('click',async()=>{
    if(!preparedInquiry) return;
    try{
      await navigator.clipboard.writeText(preparedInquiry);
      status.textContent='Inquiry details copied. Paste them into any email or message app.';
    }catch(_error){
      const textarea=document.createElement('textarea');
      textarea.value=preparedInquiry; textarea.style.position='fixed'; textarea.style.opacity='0';
      document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
      status.textContent='Inquiry details copied. Paste them into any email or message app.';
    }
  });

  form.querySelectorAll('[data-catering-sms],[data-catering-gmail],[data-catering-outlook]').forEach(link=>link.addEventListener('click',()=>{
    status.textContent='Your message is prepared. Review it, then press Send in the app that opens.';
  }));
}

function escapeHtml(str){ return String(str).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.addEventListener('DOMContentLoaded',()=>{ updateCutoff(); setInterval(updateCutoff,60000); navInit(); hydratePreviewCards(); orderInit(); cateringInit(); });
