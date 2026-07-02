const BUSINESS_PHONE = '19297424202';
const BUSINESS_PHONE_DISPLAY = '(929) 742-4202';
const BUSINESS_EMAIL = 'islanddelicacy@outlook.com';
const SIDES = ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta'];
const state = { item:null, sides:[], extra:false, qty:1, date:'', name:'', phone:'' };
function laNow(){ return new Date(new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles' })); }
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate()+days); return d; }
function fmtDate(d){ return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/Los_Angeles'}); }
function fullDate(d){ return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'}); }
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
  wrap.innerHTML = window.ISLAND_MENU.slice(0,4).map(item => `<article class="plate-card"><figure><img src="${item.image}" alt="${item.name} plate" loading="lazy"><span class="chip">Limited daily</span></figure><div class="plate-body"><div class="plate-title">${item.name}</div><div class="plate-meta"><span>${item.category}</span><span>$${item.price}</span></div></div></article>`).join('');
}
function orderInit(){
  const root=document.querySelector('[data-order-app]'); if(!root || !window.ISLAND_MENU) return;
  const params=new URLSearchParams(location.search);
  if(params.get('confirmed')==='1') document.querySelector('[data-confirmation]')?.classList.remove('hidden');
  const info=cutoffInfo(); const dates=[]; for(let i=0;i<5;i++) dates.push(addDays(info.now, info.firstOffset+i)); state.date=fmtDate(dates[0]);
  renderChoices(); renderDates(dates); bindInputs(); renderSummary();
}
function renderChoices(){
  const wrap=document.querySelector('[data-plate-choices]');
  wrap.innerHTML = window.ISLAND_MENU.map(item => `<button type="button" class="choice" data-item="${item.id}"><div class="choice-title"><span>${item.name}</span><span>$${item.price}</span></div><small>${item.category} · rice & peas included · <b>Limited daily</b></small></button>`).join('');
  wrap.addEventListener('click', e=>{ const btn=e.target.closest('[data-item]'); if(!btn) return; state.item=window.ISLAND_MENU.find(x=>x.id===btn.dataset.item); renderChoicesSelected(); renderSummary(); });
}
function renderChoicesSelected(){ document.querySelectorAll('[data-item]').forEach(btn=>btn.classList.toggle('selected', state.item && btn.dataset.item===state.item.id)); }
function renderDates(dates){
  const wrap=document.querySelector('[data-date-chips]');
  wrap.innerHTML = dates.map((d,i)=>`<button type="button" class="date-chip ${i===0?'selected':''}" data-date="${fmtDate(d)}" title="${fullDate(d)}">${fmtDate(d)}</button>`).join('');
  wrap.addEventListener('click',e=>{const b=e.target.closest('[data-date]'); if(!b) return; state.date=b.dataset.date; document.querySelectorAll('[data-date]').forEach(x=>x.classList.toggle('selected',x===b)); renderSummary();});
}
function bindInputs(){
  document.querySelectorAll('[name="side"]').forEach(input=>input.addEventListener('change',()=>{
    const checked=[...document.querySelectorAll('[name="side"]:checked')];
    if(checked.length>2){ input.checked=false; alert('Pick exactly 2 sides. Extra side is a separate $5 toggle.'); return; }
    state.sides=checked.map(x=>x.value); renderSummary();
  }));
  document.querySelector('[name="extraSide"]')?.addEventListener('change',e=>{state.extra=e.target.checked; renderSummary();});
  document.querySelector('[data-qty-minus]')?.addEventListener('click',()=>{state.qty=Math.max(1,state.qty-1); document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();});
  document.querySelector('[data-qty-plus]')?.addEventListener('click',()=>{state.qty=Math.min(10,state.qty+1); document.querySelector('[data-qty-value]').textContent=state.qty; renderSummary();});
  document.querySelector('[name="customerName"]')?.addEventListener('input',e=>{state.name=e.target.value.trim(); renderSummary();});
  document.querySelector('[name="customerPhone"]')?.addEventListener('input',e=>{state.phone=e.target.value.trim(); renderSummary();});
  document.querySelector('[data-checkout]')?.addEventListener('click', checkout);
}
function valid(){ return state.item && state.sides.length===2 && state.date && state.name.length>1 && state.phone.length>6; }
function total(){ return state.item ? (state.item.price * state.qty) + (state.extra ? 5 : 0) : 0; }
function renderSummary(){
  const lines=document.querySelector('[data-summary-lines]'), totalEl=document.querySelector('[data-total]'), btn=document.querySelector('[data-checkout]'); if(!lines) return;
  lines.innerHTML = `${state.item?`<div class="summary-line"><span>${state.qty} × ${state.item.name}</span><strong>$${state.item.price*state.qty}</strong></div>`:'<div class="summary-line"><span>Pick a plate</span><strong>—</strong></div>'}<div class="summary-line"><span>Sides</span><strong>${state.sides.length}/2</strong></div><div class="summary-line"><span>Pickup date</span><strong>${state.date || '—'}</strong></div>${state.extra?'<div class="summary-line"><span>Extra side</span><strong>$5</strong></div>':''}${state.name?`<div class="summary-line"><span>Name</span><strong>${escapeHtml(state.name)}</strong></div>`:''}`;
  totalEl.textContent = `$${total()}`;
  const isValid=valid(); btn.disabled=!isValid; btn.textContent = isValid ? 'CONTINUE TO SQUARE CHECKOUT →' : 'FINISH THE STEPS ABOVE';
}
function checkout(){
  if(!valid()) return;
  const note=`Island Delicacy preorder: ${state.qty} x ${state.item.name}; sides: ${state.sides.join(' + ')}${state.extra?'; extra side':''}; pickup date: ${state.date}; name: ${state.name}; phone: ${state.phone}. We'll text to set pickup time.`;
  const square = (window.SQUARE_LINKS && window.SQUARE_LINKS[state.item.id]) || '';
  if(square){ const sep=square.includes('?')?'&':'?'; window.open(`${square}${sep}note=${encodeURIComponent(note)}&quantity=${state.qty}`,'_blank','noopener'); }
  else { window.location.href = `sms:+${BUSINESS_PHONE}?&body=${encodeURIComponent(note)}`; }
}
function cateringInit(){
  const form=document.querySelector('[data-catering-form]'); if(!form) return;
  form.addEventListener('submit', e=>{ e.preventDefault(); const data=new FormData(form); const body=`Catering inquiry from ${data.get('name')}%0APhone/email: ${data.get('contact')}%0ADate: ${data.get('date')}%0AHeadcount: ${data.get('headcount')}%0A%0A${data.get('message')}`; document.querySelector('[data-catering-success]').classList.remove('hidden'); setTimeout(()=>{ window.location.href=`mailto:${BUSINESS_EMAIL}?subject=Island Delicacy catering inquiry&body=${body}`; }, 500); });
}
function escapeHtml(str){ return str.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.addEventListener('DOMContentLoaded',()=>{ updateCutoff(); setInterval(updateCutoff,60000); navInit(); hydratePreviewCards(); orderInit(); cateringInit(); });
