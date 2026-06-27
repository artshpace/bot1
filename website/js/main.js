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
  // If a form inside was already submitted (showing the success panel), reset
  // it so the visitor can book AGAIN — e.g. another child or another direction.
  m.querySelectorAll('form').forEach(resetPublicForm);
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  m.addEventListener('click', e => {
    if (e.target === m) closeModal(id);
  }, { once: false });
}

/* Bring a public form back to its blank state, but ONLY when it is currently
   showing its success panel (i.e. after a previous submission). This fixes the
   "stuck on Заявка отправлена" effect while preserving any in-progress typing. */
function resetPublicForm(form) {
  const success = form.querySelector('.form-success');
  const body = form.querySelector('.form-body');
  if (!success || !success.classList.contains('show')) return;
  success.classList.remove('show');
  if (body) body.style.display = '';
  form.querySelectorAll('input, textarea').forEach(i => { if (i.type !== 'hidden') i.value = ''; });
  form.querySelectorAll('.form-chip.selected').forEach(c => c.classList.remove('selected'));
  form.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
  form.querySelectorAll('.form-control').forEach(e => e.classList.remove('error'));
  const cal = success.querySelector('.cal-reminder'); if (cal) cal.remove();
  const acct = success.querySelector('.acct-offer'); if (acct) acct.remove();
  const ds = document.getElementById('modal-day-section'); if (ds) ds.style.display = 'none';
  const ts = document.getElementById('modal-time-section'); if (ts) ts.style.display = 'none';
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
    /* Only the direction chip group is required; day/slot groups are optional. */
    const dirGroup = form.querySelector('[data-chip-role="direction"]');
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
      injectCalendarButtons(form);
      injectAccountOffer(form);
      window.open(buildWhatsAppFromForm(form), '_blank');
    }
  });
}

/* Already signed into the cabinet? (mock session written by api.js / supa.js) */
function isLoggedIn() {
  try { return !!JSON.parse(localStorage.getItem('sas_session')); } catch (e) { return false; }
}

/* Offer to turn the trial submission into a real cabinet account — prefilled
   with the name/phone the visitor just typed. We OFFER (not auto-create) so we
   don't litter the system with empty accounts. Hidden for already-signed-in
   users (they may just be booking another child). */
function injectAccountOffer(form) {
  if (isLoggedIn()) return;
  const success = form.querySelector('.form-success');
  if (!success || success.querySelector('.acct-offer')) return;
  const data = {};
  form.querySelectorAll('[name]').forEach(i => { data[i.name] = (i.value || '').trim(); });
  const params = new URLSearchParams();
  if (data.name) params.set('name', data.name);
  if (data.phone) params.set('phone', data.phone);
  const href = 'account/register.html' + (params.toString() ? '?' + params.toString() : '');

  const wrap = document.createElement('div');
  wrap.className = 'acct-offer';
  wrap.style.cssText = 'margin-top:18px;padding-top:16px;border-top:1px solid rgba(0,0,0,.08);';
  wrap.innerHTML =
    '<p style="font-size:0.85rem;color:var(--muted);margin:0 0 10px;">Хотите видеть расписание, посещаемость и прогресс? Заведите личный кабинет — имя и телефон уже подставлены.</p>' +
    '<a href="' + href + '" class="btn btn-primary btn-full">Создать личный кабинет</a>';

  const closeBtn = success.querySelector('button');
  if (closeBtn) success.insertBefore(wrap, closeBtn);
  else success.appendChild(wrap);
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
  const dirGroup = form.querySelector('[data-chip-role="direction"]');
  const chip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = chip ? (CHIP_DIRECTION[chip.dataset.value] !== undefined && CHIP_DIRECTION[chip.dataset.value] !== ''
    ? CHIP_DIRECTION[chip.dataset.value] : chip.textContent.trim()) : '';
  const dayChip = form.querySelector('[data-chip-role="day"] .form-chip.selected');
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const slot = [dayChip ? dayChip.textContent.trim() : '', slotChip ? slotChip.textContent.trim() : ''].filter(Boolean).join(', ');

  const utm = getUTM();
  const payload = {
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    age: data.age || '',
    direction: direction,
    source: FORM_SOURCE[formId] || 'callback',
    preferredDate: (dayChip && dayChip.getAttribute('data-date')) || data.date || '',
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
        name: payload.name, phone: payload.phone, email: payload.email, age: payload.age,
        direction: payload.direction, slot: payload.preferredTime,
        slotDate: payload.preferredDate,
        source: payload.source, comment: payload.comment,
        utm: payload.utm
      })
    }).catch(() => { /* silent — lead already saved locally */ });
  }
  /* Mark a completed registration for the Pixel even if no real id is set. */
  if (window.fbq) window.fbq('track', 'CompleteRegistration', { content_name: direction || 'Заявка' });
}

/* ===== SCHEDULE-DRIVEN TRIAL FORM [v1.2] =====
   Direction chip drives which days and time slots are shown.
   Source: real studio timetable supplied by owner 2026-06. */
const SCHEDULE = {
  guitar: {
    days: ['Понедельник', 'Среда', 'Пятница'],
    slots: function () {
      /* Group 8 (20:00–21:00) is the adult 18+ group — always offered. */
      return ['9:00–10:00', '10:00–11:00', '11:00–12:00',
              '16:00–17:00', '17:00–18:00', '18:00–19:00', '19:00–20:00',
              '20:00–21:00 (18+)'];
    }
  },
  painting: {
    days: ['Суббота', 'Воскресенье'],
    slots: function () { return ['10:00–12:00']; }
  },
  vocals: {
    days: ['Суббота', 'Воскресенье'],
    slots: function (age) {
      return parseInt(age) >= 11 ? ['13:00–14:00'] : ['12:00–13:00'];
    }
  }
};

function initScheduleForm(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  var dirChipsEl = form.querySelector('[data-chip-role="direction"]');
  var ageInput   = form.querySelector('[name="age"]');
  var daySection = document.getElementById('modal-day-section');
  var dayChipsEl = document.getElementById('modal-day-chips');
  var timeSection = document.getElementById('modal-time-section');
  var slotChipsEl = document.getElementById('slot-chips');
  var schedNote  = document.getElementById('modal-schedule-note');

  function makeChips(el, items) {
    el.innerHTML = items.map(function (v) {
      return '<button type="button" class="form-chip" data-value="' + v + '">' + v + '</button>';
    }).join('');
  }

  function update() {
    var sel = dirChipsEl && dirChipsEl.querySelector('.form-chip.selected');
    var dir = sel ? sel.dataset.value : null;
    var age = ageInput ? ageInput.value : '';
    var sched = dir ? SCHEDULE[dir] : null;

    if (!sched) {
      if (daySection) daySection.style.display = 'none';
      if (timeSection) {
        if (dir && dir !== 'any') {
          timeSection.style.display = '';
          if (slotChipsEl) slotChipsEl.innerHTML = '';
          if (schedNote) { schedNote.textContent = 'Расписание уточним при звонке'; schedNote.style.display = ''; }
        } else {
          timeSection.style.display = 'none';
        }
      }
      return;
    }

    if (daySection && dayChipsEl) {
      renderDateChips(dayChipsEl, sched.days);
      daySection.style.display = '';
    }
    if (timeSection && slotChipsEl) {
      makeChips(slotChipsEl, sched.slots(age));
      timeSection.style.display = '';
      if (schedNote) schedNote.style.display = 'none';
    }
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.form-chip');
    if (!chip || !dirChipsEl || !dirChipsEl.contains(chip)) return;
    setTimeout(update, 0);
  });
  if (ageInput) ageInput.addEventListener('input', update);
}

document.addEventListener('DOMContentLoaded', () => {
  ['trial-form', 'callback-form', 'course-form', 'modal-form'].forEach(id => setupForm(id));
  applyDirectorSlots();
  applyDirectorPricing();
  applyDirectorContacts();
  renderReviews();
  initScheduleForm('modal-form');
});

/* ===== WHATSAPP ROUTING [v1.1] =====
   The studio is lead-gen, not e-commerce: every booking funnels into WhatsApp.
   buildWhatsAppLink() makes a generic link; buildWhatsAppFromForm() pre-fills
   the parent's submitted details so the chat opens ready to send. */
const WA_NUMBER = '77086366351';
/* Cloudflare Worker (workers/lead-forwarder.js) → Telegram. */
const WORKER_URL = 'https://sas-lead-forwarder.artshpace.workers.dev/submit-lead';

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
  const dirGroup = form.querySelector('[data-chip-role="direction"]');
  const dirChip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = dirChip ? (CHIP_DIRECTION[dirChip.dataset.value] !== undefined && CHIP_DIRECTION[dirChip.dataset.value] !== ''
    ? CHIP_DIRECTION[dirChip.dataset.value] : dirChip.textContent.trim()) : '';
  const dayChip = form.querySelector('[data-chip-role="day"] .form-chip.selected');
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const lines = ['Здравствуйте! Хочу записаться на бесплатное пробное занятие.'];
  if (data.name) lines.push('Имя: ' + data.name);
  if (data.phone) lines.push('Телефон: ' + data.phone);
  if (data.age) lines.push('Возраст: ' + data.age);
  if (direction) lines.push('Направление: ' + direction);
  const preferredSlot = [dayChip ? dayChip.textContent.trim() : '', slotChip ? slotChip.textContent.trim() : ''].filter(Boolean).join(', ');
  if (preferredSlot) lines.push('Удобно: ' + preferredSlot);
  else if (data.date) lines.push('Дата: ' + data.date);
  return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
}

/* ===== CALENDAR REMINDER FOR THE VISITOR [Phase 2 P2] =====
   After a trial booking with a concrete day + time, offer "Add to calendar"
   so the parent/student doesn't forget. Pure client-side: a Google Calendar
   template link + a downloadable .ics (Apple/other). Times are pinned to
   Asia/Almaty (UTC+5, no DST) so they don't drift on out-of-town devices. */
const STUDIO_ADDRESS = 'ул. Интернациональная, 63, 5 этаж, Петропавловск';
const RU_WEEKDAYS = {
  'воскресенье': 0, 'понедельник': 1, 'вторник': 2, 'среда': 3,
  'четверг': 4, 'пятница': 5, 'суббота': 6
};
const RU_SHORT_DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const RU_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtDateChip(d) { return RU_SHORT_DOW[d.getDay()] + ', ' + d.getDate() + ' ' + RU_MONTHS_GEN[d.getMonth()]; }

/* Upcoming concrete dates (next ~4 weeks) that fall on the given Russian
   weekday names, soonest first. Drives the date picker in the trial form. */
function upcomingDates(days, weeks) {
  const wanted = {};
  (days || []).forEach(name => { const n = RU_WEEKDAYS[(name || '').toLowerCase()]; if (n !== undefined) wanted[n] = 1; });
  const out = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const max = (weeks || 4) * 7;
  for (let i = 1; i <= max && out.length < 8; i++) {
    const c = new Date(base); c.setDate(base.getDate() + i);
    if (wanted[c.getDay()]) out.push(c);
  }
  return out;
}
function renderDateChips(el, days) {
  const dates = upcomingDates(days, 4);
  if (!dates.length) { el.innerHTML = ''; return; }
  el.innerHTML = dates.map(c => {
    const iso = c.getFullYear() + '-' + pad2(c.getMonth() + 1) + '-' + pad2(c.getDate());
    return '<button type="button" class="form-chip" data-value="' + iso + '" data-date="' + iso + '">' + fmtDateChip(c) + '</button>';
  }).join('');
}

/* Next calendar date (Y/M/D) for a Russian weekday name, strictly in the future. */
function nextDateForWeekday(ruDay) {
  const target = RU_WEEKDAYS[(ruDay || '').trim().toLowerCase()];
  if (target === undefined) return null;
  const d = new Date();
  let add = (target - d.getDay() + 7) % 7;
  if (add === 0) add = 7;            // "today" → push to next week
  d.setDate(d.getDate() + add);
  return d;
}

/* Parse "17:00–18:00" / "20:00-21:00 (18+)" → {sh,sm,eh,em}. */
function parseTimeRange(s) {
  const m = (s || '').match(/(\d{1,2}):(\d{2})\D+?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { sh: +m[1], sm: +m[2], eh: +m[3], em: +m[4] };
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
/* Local "floating" stamp YYYYMMDDTHHMMSS (no Z — interpreted in TZID/ctz). */
function calStamp(date, h, m) {
  return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
    'T' + pad2(h) + pad2(m) + '00';
}

/* Build the Google Calendar "add event" URL. */
function googleCalUrl(title, date, r, details) {
  const dates = calStamp(date, r.sh, r.sm) + '/' + calStamp(date, r.eh, r.em);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: title, dates: dates,
    details: details || '', location: STUDIO_ADDRESS, ctz: 'Asia/Almaty'
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

/* Build a downloadable .ics (with a minimal Asia/Almaty VTIMEZONE). */
function icsDataUri(title, date, r, details) {
  const dtStart = calStamp(date, r.sh, r.sm);
  const dtEnd = calStamp(date, r.eh, r.em);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shpigotskiy Art Space//trial//RU',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Almaty',
    'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'TZNAME:+05', 'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:' + stamp + '-' + Math.random().toString(36).slice(2) + '@artshpace',
    'DTSTAMP:' + stamp,
    'DTSTART;TZID=Asia/Almaty:' + dtStart,
    'DTEND;TZID=Asia/Almaty:' + dtEnd,
    'SUMMARY:' + title,
    'DESCRIPTION:' + (details || ''),
    'LOCATION:' + STUDIO_ADDRESS,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY',
    'DESCRIPTION:' + title, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
}

/* Inject the two "Add to calendar" buttons into a trial form's success panel,
   but only when a concrete day + time slot were chosen. */
function injectCalendarButtons(form) {
  const success = form.querySelector('.form-success');
  if (!success || success.querySelector('.cal-reminder')) return; // no dupes
  const dayChip = form.querySelector('[data-chip-role="day"] .form-chip.selected');
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  if (!dayChip || !slotChip) return;                              // nothing to schedule
  // The day chip now carries a concrete ISO date; fall back to weekday parsing.
  const iso = dayChip.getAttribute('data-date');
  const date = iso ? new Date(iso + 'T00:00:00') : nextDateForWeekday(dayChip.textContent);
  const range = parseTimeRange(slotChip.textContent);
  if (!date || !range) return;

  const dirGroup = form.querySelector('[data-chip-role="direction"]');
  const dirChip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = dirChip ? (CHIP_DIRECTION[dirChip.dataset.value] || dirChip.textContent.trim()) : '';
  const title = 'Пробное занятие' + (direction ? ' — ' + direction : '');
  const details = 'Бесплатное пробное занятие в Shpigotskiy Art Space. ' +
    'Если планы изменятся — напишите нам: https://wa.me/' + WA_NUMBER;

  const gUrl = googleCalUrl(title, date, range, details);
  const ics = icsDataUri(title, date, range, details);

  const wrap = document.createElement('div');
  wrap.className = 'cal-reminder';
  wrap.style.cssText = 'margin-top:20px;display:flex;flex-direction:column;gap:10px;';
  wrap.innerHTML =
    '<p style="font-size:0.85rem;color:var(--muted);margin:0;">Добавьте занятие в календарь, чтобы не забыть:</p>' +
    '<a href="' + gUrl + '" target="_blank" rel="noopener" class="btn btn-white btn-full">📅 Google Календарь</a>' +
    '<a href="' + ics + '" download="probnoe-zanyatie.ics" class="btn btn-white btn-full">📲 Скачать для телефона (.ics)</a>';

  const closeBtn = success.querySelector('button');
  if (closeBtn) success.insertBefore(wrap, closeBtn);
  else success.appendChild(wrap);
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
  document.querySelectorAll('[data-chip-role="slot"]:not([data-schedule-driven])').forEach(group => {
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
