/* ===== AD ATTRIBUTION (UTM) + META PIXEL  [v1.0] =====
   Captures campaign params from the landing URL so every lead created on
   the public site carries its ad source, and boots a Meta Pixel (real
   library only if a Pixel ID is configured; otherwise a safe stub). */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const LS_UTM = 'sas_utm';

function captureUTM() {
  try {
    const params = new URLSearchParams(location.search);
    if (!UTM_KEYS.some(k => params.get(k))) return;
    const utm = { landedAt: new Date().toISOString(), landingPage: location.pathname };
    UTM_KEYS.forEach(k => { utm[k.replace('utm_', '')] = params.get(k) || ''; });
    localStorage.setItem(LS_UTM, JSON.stringify(utm));
  } catch (e) { /* ignore */ }
}
function getUTM() {
  try { return JSON.parse(localStorage.getItem(LS_UTM) || '{}'); } catch (e) { return {}; }
}
window.SAS_getUTM = getUTM;

function bootPixel() {
  if (window.fbq) return;
  const n = window.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  let pixelId = '';
  try {
    const cfg = JSON.parse(localStorage.getItem('sas_meta_config') || '{}');
    if (cfg.enabled && cfg.pixelId) pixelId = cfg.pixelId;
    /* Director panel can supply the Pixel ID; only accept a real numeric id,
       never the XXXXXXXXXXXXXXXX placeholder, so we don't init a dead pixel. */
    const dc = JSON.parse(localStorage.getItem('sas_director_contacts') || '{}');
    if (dc.pixelId && /^\d{6,}$/.test(String(dc.pixelId).trim())) pixelId = String(dc.pixelId).trim();
  } catch (e) { /* ignore */ }
  if (pixelId) {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', pixelId);
  }
  window.fbq('track', 'PageView');
}
captureUTM();
bootPixel();

/* ===== NAVIGATION ===== */
const header = document.querySelector('.site-header');
const hamburger = document.querySelector('.nav-hamburger');
const mobileNav = document.querySelector('.mobile-nav');

window.addEventListener('scroll', () => {
  header && header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

hamburger && hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileNav.classList.toggle('open');
  document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
});

document.querySelectorAll('.mobile-nav a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger && hamburger.classList.remove('open');
    mobileNav && mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  });
});

/* "О школе" dropdown — click toggle (hover handles desktop via CSS) */
document.querySelectorAll('.nav-dropdown-toggle').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const dd = btn.closest('.nav-dropdown');
    const open = dd.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.nav-dropdown.open').forEach(dd => dd.classList.remove('open'));
});

/* ===== SCROLL ANIMATIONS ===== */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); });
}, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

/* ===== FAQ ACCORDION ===== */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ===== MODAL ===== */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  m.addEventListener('click', e => {
    if (e.target === m) closeModal(id);
  }, { once: false });
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('open');
  document.body.style.overflow = '';
}
window.openModal = openModal;
window.closeModal = closeModal;

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

/* ===== FORM CHIPS (delegated so dynamically-rendered slot chips also work) ===== */
document.addEventListener('click', e => {
  const chip = e.target.closest('.form-chip');
  if (!chip) return;
  const group = chip.closest('.form-chips');
  if (!group) return;
  const multi = group.dataset.multi === 'true';
  if (!multi) group.querySelectorAll('.form-chip').forEach(c => c.classList.remove('selected'));
  chip.classList.toggle('selected');
});

/* ===== TRIAL FORM ===== */
function validatePhone(v) { return /[\d\s\-\+\(\)]{7,}/.test(v.trim()); }
function validateName(v) { return v.trim().length >= 2; }

function setupForm(formId, onSuccess) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('[required]').forEach(input => {
      const err = document.getElementById(input.dataset.err);
      let ok = true;
      if (input.type === 'tel') ok = validatePhone(input.value);
      else ok = validateName(input.value);
      if (!ok) { valid = false; input.classList.add('error'); if (err) err.classList.add('show'); }
      else { input.classList.remove('error'); if (err) err.classList.remove('show'); }
    });
    /* Only the direction chip group is required; the slot group is optional. */
    const dirGroup = form.querySelector('.form-chips:not([data-chip-role="slot"])');
    const chip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
    const chipErr = form.querySelector('.chip-err');
    if (dirGroup && !chip) {
      valid = false;
      if (chipErr) chipErr.classList.add('show');
    } else if (chipErr) chipErr.classList.remove('show');

    if (!valid) return;

    const body = form.querySelector('.form-body');
    const success = form.querySelector('.form-success');
    if (body) body.style.display = 'none';
    if (success) success.classList.add('show');
    if (onSuccess) onSuccess(form);

    /* Keep the CRM lead (existing behaviour) AND route the parent to WhatsApp
       with their details pre-filled, after the success screen is shown. */
    submitLead(formId, form);
    if (FORM_SOURCE[formId] === 'trial') {
      window.open(buildWhatsAppFromForm(form), '_blank');
    }
  });
}

/* Map the public direction chips to the canonical direction names used by
   the CRM, so leads land with a meaningful direction. */
const CHIP_DIRECTION = {
  guitar: 'Гитара', vocals: 'Вокал', painting: 'Живопись',
  acting: 'Актёрское мастерство', dance: 'Современный танец', any: ''
};
/* Form id → lead source. */
const FORM_SOURCE = {
  'trial-form': 'trial', 'modal-form': 'trial',
  'callback-form': 'callback', 'course-form': 'course'
};

/* Persist a public-site submission as a CRM lead (with UTM + Pixel events).
   Degrades gracefully if the API layer isn't present on a given page. */
function submitLead(formId, form) {
  const data = {};
  form.querySelectorAll('[name]').forEach(inp => { data[inp.name] = (inp.value || '').trim(); });
  const dirGroup = form.querySelector('.form-chips:not([data-chip-role="slot"])');
  const chip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = chip ? (CHIP_DIRECTION[chip.dataset.value] !== undefined && CHIP_DIRECTION[chip.dataset.value] !== ''
    ? CHIP_DIRECTION[chip.dataset.value] : chip.textContent.trim()) : '';
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const slot = slotChip ? slotChip.textContent.trim() : '';

  const utm = getUTM();
  const payload = {
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    age: data.age || '',
    direction: direction,
    source: FORM_SOURCE[formId] || 'callback',
    preferredDate: data.date || '',
    preferredTime: slot || data.time || '',
    comment: data.comment || data.message || '',
    utm: {
      source: utm.source || '', medium: utm.medium || '', campaign: utm.campaign || '',
      content: utm.content || '', term: utm.term || ''
    }
  };

  if (window.API && API.leads && payload.name && payload.phone) {
    API.leads.create(payload).catch(() => { /* keep the success UI; lead retried server-side */ });
  } else {
    console.log('Lead (no API on page):', formId, payload);
  }
  /* Forward to Cloudflare Worker → Telegram. Fires silently; never breaks UX. */
  if (WORKER_URL && !WORKER_URL.includes('ТВОЙ_АККАУНТ') && payload.phone) {
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name, phone: payload.phone, age: payload.age,
        direction: payload.direction, slot: payload.preferredTime,
        utm: { campaign: payload.utm.campaign, source: payload.utm.source }
      })
    }).catch(() => { /* silent — lead already saved locally */ });
  }
  /* Mark a completed registration for the Pixel even if no real id is set. */
  if (window.fbq) window.fbq('track', 'CompleteRegistration', { content_name: direction || 'Заявка' });
}

document.addEventListener('DOMContentLoaded', () => {
  ['trial-form', 'callback-form', 'course-form', 'modal-form'].forEach(id => setupForm(id));
  applyDirectorSlots();
  applyDirectorPricing();
  applyDirectorContacts();
  renderReviews();
});

/* ===== WHATSAPP ROUTING [v1.1] =====
   The studio is lead-gen, not e-commerce: every booking funnels into WhatsApp.
   buildWhatsAppLink() makes a generic link; buildWhatsAppFromForm() pre-fills
   the parent's submitted details so the chat opens ready to send. */
const WA_NUMBER = '77086366351';
/* Replace with your actual Worker URL after deploying workers/lead-forwarder.js */
const WORKER_URL = 'https://sas-lead-forwarder.ТВОЙ_АККАУНТ.workers.dev/submit-lead';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildWhatsAppLink(direction) {
  let text = 'Здравствуйте! Хочу записать на пробное занятие';
  if (direction) text += ' (' + direction + ')';
  return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text);
}
window.buildWhatsAppLink = buildWhatsAppLink;

function buildWhatsAppFromForm(form) {
  const data = {};
  form.querySelectorAll('[name]').forEach(i => { data[i.name] = (i.value || '').trim(); });
  const dirGroup = form.querySelector('.form-chips:not([data-chip-role="slot"])');
  const dirChip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = dirChip ? (CHIP_DIRECTION[dirChip.dataset.value] !== undefined && CHIP_DIRECTION[dirChip.dataset.value] !== ''
    ? CHIP_DIRECTION[dirChip.dataset.value] : dirChip.textContent.trim()) : '';
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const lines = ['Здравствуйте! Хочу записаться на бесплатное пробное занятие.'];
  if (data.name) lines.push('Имя: ' + data.name);
  if (data.phone) lines.push('Телефон: ' + data.phone);
  if (data.age) lines.push('Возраст: ' + data.age);
  if (direction) lines.push('Направление: ' + direction);
  if (slotChip) lines.push('Удобно: ' + slotChip.textContent.trim());
  else if (data.date) lines.push('Дата: ' + data.date);
  return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
}

/* Floating navbar "Записаться" opens the trial modal directly. */
function openTrialModal() {
  if (document.getElementById('modal-trial')) openModal('modal-trial');
  else location.href = 'index.html#trial';
}
window.openTrialModal = openTrialModal;
document.querySelectorAll('.nav-cta, .mob-cta').forEach(btn => {
  const href = btn.getAttribute('href') || '';
  if (href.endsWith('#trial')) {
    btn.addEventListener('click', e => {
      if (document.getElementById('modal-trial')) { e.preventDefault(); openTrialModal(); }
    });
  }
});

/* ===== DIRECTOR-MANAGED CONTENT [v1.1] =====
   The public site reads content the director edits in admin-director.html.
   Each reader degrades to the page's static fallback when no data is set. */
function readDirector(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function applyDirectorSlots() {
  const slots = readDirector('sas_director_slots');
  if (!Array.isArray(slots)) return;
  const active = slots.filter(s => s && s.active !== false && (s.label || '').trim());
  if (!active.length) return;
  document.querySelectorAll('[data-chip-role="slot"]').forEach(group => {
    group.innerHTML = active.map(s =>
      '<button type="button" class="form-chip" data-value="' +
      escapeHtml(s.value || s.id || '') + '">' + escapeHtml(s.label) + '</button>'
    ).join('');
  });
}

function applyDirectorPricing() {
  const p = readDirector('sas_director_pricing');
  if (!p) return;
  const sub = document.getElementById('price-subscription');
  const single = document.getElementById('price-single');
  if (sub && p.subscription) sub.textContent = p.subscription;
  if (single && p.single) single.textContent = p.single;
}

function applyDirectorContacts() {
  const c = readDirector('sas_director_contacts');
  if (!c) return;
  document.querySelectorAll('[data-sas-contact]').forEach(el => {
    const key = el.getAttribute('data-sas-contact');
    const val = (c[key] || '').trim();
    if (!val) return;
    if (el.tagName === 'A') {
      if (key === 'phone') el.href = 'tel:' + val.replace(/[^\d+]/g, '');
      else if (key === 'whatsapp') el.href = 'https://wa.me/' + val.replace(/\D/g, '');
      else if (key === 'email') el.href = 'mailto:' + val;
      else if (key === 'instagram') el.href = 'https://instagram.com/' + val.replace(/^@/, '');
      else if (key === 'telegram') el.href = 'https://t.me/' + val.replace(/^@/, '');
    }
    if (el.dataset.sasContactText !== 'keep') el.textContent = val;
  });
}

function renderReviews() {
  const grid = document.getElementById('reviews-grid');
  if (!grid) return;
  const list = readDirector('sas_director_reviews');
  if (!Array.isArray(list)) return;            /* keep static fallback markup */
  const active = list.filter(r => r && r.active !== false);
  if (!active.length) return;                  /* keep static fallback markup */
  grid.innerHTML = active.map(r => {
    const n = Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5));
    const stars = '★★★★★'.slice(0, n);
    const name = (r.author || 'Родитель').trim();
    const avatar = name.charAt(0).toUpperCase();
    return '<div class="review-card fade-up">' +
      '<div class="review-stars">' + stars + '</div>' +
      '<p class="review-text">' + escapeHtml(r.text || '') + '</p>' +
      '<div class="review-author">' +
      '<div class="review-author-avatar">' + escapeHtml(avatar) + '</div>' +
      '<div><div class="review-author-name">' + escapeHtml(name) + '</div>' +
      '<div class="review-author-role">' + escapeHtml(r.direction || '') + '</div></div>' +
      '</div></div>';
  }).join('');
}

/* ===== ACTIVE NAV LINK ===== */
const path = location.pathname;
document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(a => {
  const href = a.getAttribute('href') || '';
  if (href === path || (href !== '/' && path.startsWith(href.replace(/index\.html$/, '')))) {
    a.classList.add('active');
  }
});

/* ===== SMOOTH COUNTER ANIMATION ===== */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const suffix = el.dataset.suffix || '';
  const duration = 1800;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.floor(eased * target) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const counterObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounter(e.target); counterObs.unobserve(e.target); } });
}, { threshold: .5 });
document.querySelectorAll('[data-target]').forEach(el => counterObs.observe(el));
