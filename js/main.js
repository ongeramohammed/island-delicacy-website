const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const PHONE_DISPLAY = '(929) 742-4202';

const chatAnswers = [
  {
    keys: ['order', 'text', 'call', 'start'],
    answer: `To order, text or call ${PHONE_DISPLAY}. Send the dish name, sides, quantity, and preferred pickup or delivery time. Island Delicacy will confirm availability before preparing your plate.`
  },
  {
    keys: ['notice', 'early', 'advance', 'time', 'when'],
    answer: '24-hour advance notice is recommended because meals are prepared in limited daily quantities. Text first to confirm what is available.'
  },
  {
    keys: ['best', 'popular', 'seller', 'try', 'recommend'],
    answer: 'Popular first picks include Oxtail, Jerk Chicken, Curry Goat, Oxtail Rasta Pasta, Escovitch Fish, and Curry Shrimp.'
  },
  {
    keys: ['pay', 'payment', 'zelle', 'cash', 'apple'],
    answer: 'Payment options listed on the site are Zelle, Cash App, and Apple Pay. Confirm payment details directly by text before sending payment.'
  },
  {
    keys: ['pickup', 'delivery', 'location', 'area', 'where'],
    answer: 'Pickup or delivery details are confirmed by text for each order. Send your preferred timing and area so Island Delicacy can confirm what works.'
  },
  {
    keys: ['cater', 'catering', 'event', 'tray', 'party', 'large'],
    answer: 'For catering, event trays, or larger pre-orders, text the date, guest count, dishes, and pickup/delivery needs. Island Delicacy will confirm availability.'
  },
  {
    keys: ['menu', 'price', 'cost', 'side', 'sides'],
    answer: 'Chicken plates are $20, oxtail and curry goat are $25, rasta pasta starts at $22, seafood starts at $25, and most plates include rice & peas plus two sides.'
  },
  {
    keys: ['hours', 'open', 'closed'],
    answer: 'Availability can change because plates are made by pre-order. Text first to confirm the current ordering window.'
  }
];

function getChatAnswer(question) {
  const q = question.toLowerCase();
  const match = chatAnswers.find((item) => item.keys.some((key) => q.includes(key)));
  return match ? match.answer : `I can help with ordering, notice, menu, best sellers, payment, pickup/delivery, and catering. For the fastest answer, text or call ${PHONE_DISPLAY}.`;
}

function setupChat() {
  const widget = document.querySelector('.chat-widget');
  if (!widget) return;

  const launch = widget.querySelector('.chat-launch');
  const panel = widget.querySelector('.chat-panel');
  const close = widget.querySelector('.chat-close');
  const body = widget.querySelector('.chat-body');
  const form = widget.querySelector('.chat-form');
  const input = widget.querySelector('#chat-input');
  const promptButtons = widget.querySelectorAll('[data-question]');
  const openers = document.querySelectorAll('.open-chat');

  const setOpen = (open) => {
    panel.hidden = !open;
    launch.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => input?.focus(), 80);
  };

  const addMessage = (text, type = 'bot') => {
    const msg = document.createElement('div');
    msg.className = `chat-msg ${type}`;
    msg.textContent = text;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  };

  const ask = (question) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    addMessage(trimmed, 'user');
    window.setTimeout(() => addMessage(getChatAnswer(trimmed), 'bot'), 180);
  };

  launch.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  openers.forEach((btn) => btn.addEventListener('click', () => setOpen(true)));
  promptButtons.forEach((btn) => btn.addEventListener('click', () => ask(btn.dataset.question || btn.textContent)));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
    input.value = '';
  });
}

setupChat();


function setupMotionReveals() {
  const targets = document.querySelectorAll('.section-heading, .quick-cards article, .dish-card, .menu-card, .plate-infographic, .motion-steps article, .story-card, .gallery-grid figure, .card, .map-card');
  if (!targets.length) return;
  targets.forEach((el) => el.classList.add('reveal-on-scroll'));
  document.documentElement.classList.add('reveal-ready');

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });

  targets.forEach((el) => observer.observe(el));
}

setupMotionReveals();
