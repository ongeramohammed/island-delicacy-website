/* Permanent event directory; independent of preorder/cart logic. */
(()=>{'use strict';
const entries=[...document.querySelectorAll('[data-event-end]')];
function refresh(){
 const now=Date.now();let upcoming=0;
 entries.forEach(entry=>{const start=Date.parse(entry.dataset.eventStart),end=Date.parse(entry.dataset.eventEnd),past=now>=end;if(!past)upcoming++;entry.querySelector('[data-event-status]').textContent=past?'Past event':now>=start?'Happening now':'Upcoming event';entry.querySelector('[data-event-archive]').hidden=!past;entry.classList.toggle('is-past',past);});
 const heading=document.querySelector('[data-events-heading]');if(heading)heading.textContent=upcoming?'On the calendar':'Past events';
 const empty=document.querySelector('[data-events-empty]');if(empty)empty.hidden=upcoming>0;
}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
})();
