const BUSINESS_PHONE = '19297424202';
const BUSINESS_PHONE_DISPLAY = '(929) 742-4202';
const BUSINESS_EMAIL = 'islanddelicacy@outlook.com';
const DEFAULT_SIDES = ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta'];
const RASTA_SIDES = ['Steamed Cabbage', 'Sweet Plantains', 'Rice & Peas'];
const SIDE_ONLY_OPTIONS = ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta', 'Rice & Peas'];
const state = { item:null, sides:[], meat:false, qty:1, date:'', name:'', phone:'', note:'', sideOnly:[] };

function laNow(){ return new Date(new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles' })); }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate()+days); return d; }
function fmtDate(d){ return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/Los_Angeles'}); }
function fullDate(d){ return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'}); }
function isRastaPasta(item){ return item?.category === 'Rasta Pasta'; }
function sidesFor(item){ return isRastaPasta(item) ? RASTA_SIDES : DEFAULT_SIDES; }
function meatPrice(kind){ return kind === 'oxtail' ? 12 : kind === 'meat' ? 10 : 0; }
function meatLabel(kind){ return kind === 'oxtail' ? 'extra oxtail' : kind === 'meat' ? 'extra meat' : ''; }

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
  if(params.get('confirmed')==='1' || params.get('paid')==='1') document.querySelector('[data-confirmation]')?.classList.remove('hidden');
  const info=cutoffInfo(); const dates=[]; for(let i=0;i<5;i++) dates.push(addDays(info.now, info.firstOffset+i)); state.date=fmtDate(dates[0]);
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
    return `<div class="choice" data-choice-item="${item.id}"><button type="button" class="plate-thumb" data-zoom-item="${item.id}" aria-label="Enlarge ${escapeHtml(item.name)} photo" title="Tap to enlarge"><img src="${item.image}" alt="" loading="lazy" width="1400" height="1400"></button><button type="button" class="choice-pick" data-item="${item.id}"><span class="choice-title"><span>${escapeHtml(item.name)}</span><span>$${item.price}</span></span><small>${escapeHtml(item.category)} · ${inclusion} · <b>Limited daily</b></small></button></div>`;
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
    return `<label class="side-option"><img src="${image}" alt="${escapeHtml(side)}" loading="lazy" width="1400" height="1400"><span class="side-option-check"><input type="checkbox" name="side" value="${escapeHtml(side)}" ${state.sides.includes(side)?'checked':''}><span>${escapeHtml(side)}</span></span></label>`;
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
    state.sideOnly.push(button.dataset.addSide);
    renderSummary();
  });
}

function renderDates(dates){
  const wrap=document.querySelector('[data-date-chips]');
  wrap.innerHTML = dates.map((d,i)=>`<button type="button" class="date-chip ${i===0?'selected':''}" data-date="${fmtDate(d)}" title="${fullDate(d)}">${fmtDate(d)}</button>`).join('');
  wrap.addEventListener('click',e=>{const b=e.target.closest('[data-date]'); if(!b) return; state.date=b.dataset.date; document.querySelectorAll('[data-date]').forEach(x=>x.classList.toggle('selected',x===b)); renderSummary();});
}

function bindInputs(){
  document.querySelectorAll('[data-meat]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.item) return;
    state.meat=state.meat===button.dataset.meat ? false : button.dataset.meat;
    renderSummary();
  }));
  document.querySelector('[name="plateNote"]')?.addEventListener('input',e=>{state.note=e.target.value.slice(0,200); renderSummary();});
  document.querySelector('[data-qty-minus]')?.addEventListener('click',()=>{state.qty=Math.max(1,state.qty-1); document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();});
  document.querySelector('[data-qty-plus]')?.addEventListener('click',()=>{state.qty=Math.min(10,state.qty+1); document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();});
  document.querySelector('[name="customerName"]')?.addEventListener('input',e=>{state.name=e.target.value.trim(); renderSummary();});
  document.querySelector('[name="customerPhone"]')?.addEventListener('input',e=>{state.phone=e.target.value.trim(); renderSummary();});
  document.querySelector('[data-summary-lines]')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-remove-side]'); if(!button) return;
    state.sideOnly.splice(Number(button.dataset.removeSide),1); renderSummary();
  });
  document.querySelector('[data-checkout]')?.addEventListener('click', checkout);
}

function plateValid(){ return Boolean(state.item && state.sides.length===2); }
function valid(){
  const hasOrder=plateValid() || state.sideOnly.length>0;
  const plateIsComplete=!state.item || plateValid();
  return hasOrder && plateIsComplete && state.date && state.name.length>1 && state.phone.length>6;
}
function plateTotal(){ return state.item ? (state.item.price * state.qty) + meatPrice(state.meat) : 0; }
function total(){ return plateTotal() + state.sideOnly.length*5; }

function renderSummary(){
  const lines=document.querySelector('[data-summary-lines]'), totalEl=document.querySelector('[data-total]'), btn=document.querySelector('[data-checkout]'); if(!lines) return;
  const orderLines=[];
  if(state.item){
    const details=plateValid()
      ? [...state.sides, meatLabel(state.meat), state.note.trim()].filter(Boolean).map(escapeHtml).join(' · ')
      : `Choose 2 sides (${state.sides.length}/2)`;
    orderLines.push(`<div class="summary-line"><span class="summary-copy"><b>${state.qty} × ${escapeHtml(state.item.name)}</b><small>${details}</small></span><strong>$${plateTotal()}</strong></div>`);
  }
  state.sideOnly.forEach((side,index)=>orderLines.push(`<div class="summary-line"><span class="summary-copy"><b>${escapeHtml(`Side · ${side}`)}</b></span><span class="summary-action"><strong>$5</strong><button type="button" data-remove-side="${index}" aria-label="Remove ${escapeHtml(side)}">×</button></span></div>`));
  if(orderLines.length===0) orderLines.push('<div class="summary-line"><span>Pick a plate or add sides</span><strong>—</strong></div>');
  orderLines.push(`<div class="summary-line"><span>Pickup date</span><strong>${escapeHtml(state.date || '—')}</strong></div>`);
  if(state.name) orderLines.push(`<div class="summary-line"><span>Name</span><strong>${escapeHtml(state.name)}</strong></div>`);
  lines.innerHTML=orderLines.join('');
  totalEl.textContent = `$${total()}`;
  document.querySelectorAll('[data-meat]').forEach(button=>{
    const active=state.meat===button.dataset.meat;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',String(active));
    button.disabled=!state.item;
  });
  const isValid=valid();
  const square=(window.SQUARE_LINKS && state.item && window.SQUARE_LINKS[state.item.id]) || '';
  const squareEligible=Boolean(square && plateValid() && state.sideOnly.length===0);
  btn.disabled=!isValid;
  btn.textContent = !isValid ? 'FINISH THE STEPS ABOVE' : squareEligible ? 'CONTINUE TO SQUARE CHECKOUT →' : "TEXT ORDER — WE'LL SEND A PAYMENT LINK";
}

function checkout(){
  if(!valid()) return;
  const orderLines=[];
  if(plateValid()){
    const details=[`sides: ${state.sides.join(' + ')}`, meatLabel(state.meat), state.note.trim() ? `note: ${state.note.trim()}` : ''].filter(Boolean).join('; ');
    orderLines.push(`${state.qty} x ${state.item.name} (${details}) — $${plateTotal()}`);
  }
  state.sideOnly.forEach(side=>orderLines.push(`1 x Side · ${side} — $5`));
  const note=`Island Delicacy preorder:\n${orderLines.join('\n')}\nTotal: $${total()}\nPickup date: ${state.date}\nName: ${state.name}\nPhone: ${state.phone}\nWe'll text to set pickup time.`;
  const square = plateValid() && state.sideOnly.length===0 && window.SQUARE_LINKS ? window.SQUARE_LINKS[state.item.id] || '' : '';
  if(square){
    const sep=square.includes('?')?'&':'?';
    window.open(`${square}${sep}note=${encodeURIComponent(note)}&quantity=${state.qty}`,'_blank','noopener');
  } else {
    window.location.href = `sms:+${BUSINESS_PHONE}?&body=${encodeURIComponent(note)}`;
  }
}

function cateringInit(){
  const form=document.querySelector('[data-catering-form]'); if(!form) return;
  form.addEventListener('submit', e=>{ e.preventDefault(); const data=new FormData(form); const body=`Catering inquiry from ${data.get('name')}%0APhone/email: ${data.get('contact')}%0ADate: ${data.get('date')}%0AHeadcount: ${data.get('headcount')}%0A%0A${data.get('message')}`; document.querySelector('[data-catering-success]').classList.remove('hidden'); setTimeout(()=>{ window.location.href=`mailto:${BUSINESS_EMAIL}?subject=Island Delicacy catering inquiry&body=${body}`; }, 500); });
}

function escapeHtml(str){ return String(str).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.addEventListener('DOMContentLoaded',()=>{ updateCutoff(); setInterval(updateCutoff,60000); navInit(); hydratePreviewCards(); orderInit(); cateringInit(); });
