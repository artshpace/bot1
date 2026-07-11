/* ===== AD ATTRIBUTION (UTM) + META PIXEL  [v1.0] =====
   Captures campaign params from the landing URL so every lead created on
   the public site carries its ad source, and boots a Meta Pixel (real
   library only if a Pixel ID is configured; otherwise a safe stub). */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const LS_UTM = 'sas_utm';

/* Meta Pixel ID студии (Events Manager → «Интернет»). Грузится на всех
   страницах; PageView шлётся автоматически, Lead — при отправке формы. */
const META_PIXEL_ID = '320219384379297';

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
  let pixelId = /^\d{6,}$/.test(META_PIXEL_ID) ? META_PIXEL_ID : '';
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
document.addEventListener('click', e => {
  // Закрываем только dropdown не в мобильном меню, или если клик не на ссылку
  if (e.target.closest('.mobile-nav .nav-dropdown-menu a')) {
    // Закрываем только dropdown при клике на ссылку, но оставляем мобильное меню открытым
    const dd = e.target.closest('.mobile-nav .nav-dropdown');
    if (dd) dd.classList.remove('open');
  } else {
    // Закрываем все открытые dropdown при клике вне
    document.querySelectorAll('.nav-dropdown.open').forEach(dd => {
      if (!dd.contains(e.target)) dd.classList.remove('open');
    });
  }
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
  // Reset the who/name conditional blocks back to the initial state.
  const na = document.getElementById('modal-name-adult'); if (na) na.style.display = 'none';
  const nc = document.getElementById('modal-name-child'); if (nc) nc.style.display = 'none';
  const ag = document.getElementById('modal-age-group'); if (ag) ag.style.display = '';
  form.querySelectorAll('.chip-err-who, .chip-err').forEach(e => e.classList.remove('show'));
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
/* Full name: at least two words (Фамилия + Имя). Отчество optional — so a
   Kazakh two-part name passes. Each word ≥2 letters (RU/KZ/Latin, hyphen ok). */
function validateFullName(v) {
  var words = (v || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  var re = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі''\-]{2,}$/;
  return words.every(function (w) { return re.test(w); });
}

function setupForm(formId, onSuccess) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;
    const isVisible = el => el && el.offsetParent !== null;
    /* Validate required + full-name inputs, but skip inputs inside hidden
       conditional sections (e.g. the child/adult ФИО block not in use). */
    form.querySelectorAll('input[required], input[data-fullname]').forEach(input => {
      if (!isVisible(input)) return;
      const err = document.getElementById(input.dataset.err);
      let ok;
      if (input.type === 'tel') ok = validatePhone(input.value);
      else if (input.dataset.fullname) ok = validateFullName(input.value);
      else ok = validateName(input.value);
      if (!ok) { valid = false; input.classList.add('error'); if (err) err.classList.add('show'); }
      else { input.classList.remove('error'); if (err) err.classList.remove('show'); }
    });
    /* "Кто будет заниматься?" — required when present (trial form). */
    const whoGroup = form.querySelector('[data-chip-role="who"]');
    if (whoGroup) {
      const whoSel = whoGroup.querySelector('.form-chip.selected');
      const whoErr = form.querySelector('.chip-err-who');
      if (!whoSel) { valid = false; if (whoErr) whoErr.classList.add('show'); }
      else if (whoErr) whoErr.classList.remove('show');
    }
    /* Direction chip group is required; day/slot groups are optional. */
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
  const id = trialIdentity(form);
  const params = new URLSearchParams();
  // For a child booking, the cabinet account belongs to the PARENT.
  const acctName = id.who === 'child' ? id.parentName : id.name;
  if (acctName) params.set('name', acctName);
  if (id.phone) params.set('phone', id.phone);
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

/* Resolve who is attending and the relevant name(s) from the trial form.
   adult → name = ФИО взрослого. child → name = ФИО ребёнка + parentName.
   Other forms (callback/course) just use a single name="name". */
function trialIdentity(form) {
  const data = {};
  form.querySelectorAll('[name]').forEach(i => { data[i.name] = (i.value || '').trim(); });
  const whoSel = form.querySelector('[data-chip-role="who"] .form-chip.selected');
  const who = whoSel ? whoSel.dataset.value : '';
  let name = '', parentName = '';
  if (who === 'child') { name = data.childName || ''; parentName = data.parentName || ''; }
  else if (who === 'adult') { name = data.adultName || ''; }
  else { name = data.name || data.adultName || data.childName || ''; }
  return { who: who, name: name, parentName: parentName, phone: data.phone || '',
    email: data.email || '', age: data.age || '', data: data };
}

/* Persist a public-site submission as a CRM lead (with UTM + Pixel events).
   Degrades gracefully if the API layer isn't present on a given page. */
function submitLead(formId, form) {
  const id = trialIdentity(form);
  const data = id.data;
  const dirGroup = form.querySelector('[data-chip-role="direction"]');
  const chip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = chip ? (CHIP_DIRECTION[chip.dataset.value] !== undefined && CHIP_DIRECTION[chip.dataset.value] !== ''
    ? CHIP_DIRECTION[chip.dataset.value] : chip.textContent.trim()) : '';
  const dayChip = form.querySelector('[data-chip-role="day"] .form-chip.selected');
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const slot = [dayChip ? dayChip.textContent.trim() : '', slotChip ? slotChip.textContent.trim() : ''].filter(Boolean).join(', ');

  const ageVal = id.who === 'adult' ? '18+' : (id.age || '');
  const extra = [];
  if (id.parentName) extra.push('Родитель: ' + id.parentName);
  if (id.who) extra.push(id.who === 'child' ? 'Ученик: ребёнок' : 'Ученик: взрослый');
  const comment = [data.comment || data.message || '', extra.join(' · ')].filter(Boolean).join(' | ');

  const utm = getUTM();
  const payload = {
    name: id.name,
    phone: id.phone,
    email: id.email,
    age: ageVal,
    direction: direction,
    source: FORM_SOURCE[formId] || 'callback',
    preferredDate: (dayChip && dayChip.getAttribute('data-date')) || data.date || '',
    preferredTime: slot || data.time || '',
    comment: comment,
    utm: {
      source: utm.source || '', medium: utm.medium || '', campaign: utm.campaign || '',
      content: utm.content || '', term: utm.term || ''
    }
  };

  /* Один event_id на заявку — чтобы браузерный Pixel и серверный Conversions
     API не задваивали конверсию (Meta склеит события по event_id). */
  var leadEventId = 'lead-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  try { window.__sasLeadEventId = leadEventId; } catch (e) { /* ignore */ }

  if (window.API && API.leads && payload.name && payload.phone) {
    API.leads.create(payload).catch(() => { /* keep the success UI; lead retried server-side */ });
  } else {
    console.log('Lead (no API on page):', formId, payload);
  }
  /* Forward to Cloudflare Worker → Telegram + Conversions API. Fires silently. */
  if (WORKER_URL && !WORKER_URL.includes('ТВОЙ_АККАУНТ') && payload.phone) {
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name, phone: payload.phone, email: payload.email, age: payload.age,
        direction: payload.direction, slot: payload.preferredTime,
        slotDate: payload.preferredDate,
        source: payload.source, comment: payload.comment,
        utm: payload.utm,
        eventId: leadEventId, pageUrl: (typeof location !== 'undefined' ? location.href : '')
      })
    }).catch(() => { /* silent — lead already saved locally */ });
  }
  /* Mark a completed registration for the Pixel even if no real id is set. */
  if (window.fbq) window.fbq('track', 'CompleteRegistration', { content_name: direction || 'Заявка' });
}

/* ===== SCHEDULE-DRIVEN TRIAL FORM [v1.3] =====
   Direction chip → real groups (days + time bound to age) from the studio
   timetable supplied by the owner (July 2026). The time chips depend on the
   chosen day. Directions without a fixed timetable (guitar/ukulele, painting,
   dance) fall through to the "группа формируется" note. */
const RU_DOW_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const SCHEDULE = {
  acting: {
    groups: function (age) {
      var a = parseInt(age, 10);
      var G46  = [{ days: ['Суббота', 'Воскресенье'],    time: '15:45–16:45' }];
      var G710 = [{ days: ['Понедельник', 'Среда'],      time: '15:00–16:00' },
                  { days: ['Вторник', 'Четверг'],        time: '09:30–10:30' },
                  { days: ['Суббота', 'Воскресенье'],    time: '14:45–15:45' }];
      var G1114 = [{ days: ['Понедельник', 'Среда'],     time: '09:00–10:00' },
                  { days: ['Понедельник', 'Среда'],      time: '16:00–17:00' },
                  { days: ['Суббота', 'Воскресенье'],    time: '09:00–10:30' }];
      var G14p = [{ days: ['Суббота', 'Воскресенье'],    time: '14:30–16:00' }];
      if (isNaN(a)) return G46.concat(G710, G1114, G14p);
      if (a <= 6)  return G46;
      if (a <= 10) return G710;
      if (a <= 13) return G1114;
      if (a === 14) return G1114.concat(G14p); /* 14 лет — подходят обе группы */
      return G14p;
    }
  },
  vocals: {
    groups: function (age) {
      var a = parseInt(age, 10);
      var v710 = [{ days: ['Суббота', 'Воскресенье'], time: '12:00–13:00' }];
      var v11p = [{ days: ['Суббота', 'Воскресенье'], time: '13:00–14:00' }];
      if (isNaN(a)) return v710.concat(v11p);
      return a >= 11 ? v11p : v710;
    }
  },
  /* Гитара — реальное расписание студии (совпадает с schedule.html и ботом).
     Возраст «разный» (mix), поэтому слоты одни для детей и взрослых; группа
     20:00–21:00 только для взрослых. Открывающий педагог — Георгий Захаров
     (Вт/Чт/Сб 17:00–18:00), остальные слоты ведёт Виталий Жуков. */
  guitar: {
    groups: function (age) {
      var mix = [
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '09:00–10:00' },
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '10:00–11:00' },
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '11:00–12:00' },
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '16:00–17:00' },
        { days: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'], time: '17:00–18:00' },
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '18:00–19:00' },
        { days: ['Понедельник', 'Среда', 'Пятница'], time: '19:00–20:00' }
      ];
      var adult = [{ days: ['Понедельник', 'Среда', 'Пятница'], time: '20:00–21:00' }];
      var a = parseInt(age, 10);
      if (isNaN(a)) return mix.concat(adult);
      return a >= 18 ? mix.concat(adult) : mix;
    }
  },
  /* Современный танец — Дарья Клюк. */
  dance: {
    groups: function (age) {
      var a = parseInt(age, 10);
      var d46  = [{ days: ['Понедельник', 'Среда', 'Пятница'], time: '18:30–19:30' }];
      var d710 = [{ days: ['Суббота', 'Воскресенье'], time: '13:00–14:30' }];
      var d11p = [{ days: ['Суббота', 'Воскресенье'], time: '11:30–13:00' }];
      if (isNaN(a)) return d46.concat(d710, d11p);
      if (a <= 6)  return d46;
      if (a <= 10) return d710;
      return d11p;
    }
  },
  /* Живопись — Мария Андрюшенко. */
  painting: {
    groups: function (age) {
      var a = parseInt(age, 10);
      var p46  = [{ days: ['Суббота'], time: '10:00–12:00' }];
      var p710 = [{ days: ['Воскресенье'], time: '10:00–12:00' }];
      if (isNaN(a)) return p46.concat(p710);
      return a <= 6 ? p46 : p710;
    }
  }
};

function initScheduleForm(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  var dirChipsEl = form.querySelector('[data-chip-role="direction"]');
  var whoChipsEl = form.querySelector('[data-chip-role="who"]');
  var ageInput   = form.querySelector('[name="age"]');
  var ageGroup   = document.getElementById('modal-age-group');
  var nameAdult  = document.getElementById('modal-name-adult');
  var nameChild  = document.getElementById('modal-name-child');
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

  function currentWho() {
    var s = whoChipsEl && whoChipsEl.querySelector('.form-chip.selected');
    return s ? s.dataset.value : null;
  }
  /* Adults are 18+ by definition → drives the age-gated slots without an age field. */
  function effectiveAge() {
    return currentWho() === 'adult' ? '99' : (ageInput ? ageInput.value : '');
  }
  function applyWho() {
    var who = currentWho();
    if (nameAdult) nameAdult.style.display = who === 'adult' ? '' : 'none';
    if (nameChild) nameChild.style.display = who === 'child' ? '' : 'none';
    if (ageGroup)  ageGroup.style.display  = who === 'child' ? '' : 'none';
    update();
  }

  var currentGroups = []; /* группы текущего направления/возраста — для фильтра слотов по дню */

  function selectedDayName() {
    var sel = dayChipsEl && dayChipsEl.querySelector('.form-chip.selected');
    if (!sel || !sel.dataset.date) return null;
    return RU_DOW_FULL[new Date(sel.dataset.date + 'T12:00:00').getDay()];
  }

  function renderSlots() {
    if (!slotChipsEl) return;
    var dayName = selectedDayName();
    var list = [];
    currentGroups.forEach(function (g) {
      if (dayName && g.days.indexOf(dayName) === -1) return;
      if (list.indexOf(g.time) === -1) list.push(g.time);
    });
    list.sort();
    makeChips(slotChipsEl, list);
  }

  function update() {
    var sel = dirChipsEl && dirChipsEl.querySelector('.form-chip.selected');
    var dir = sel ? sel.dataset.value : null;
    var age = effectiveAge();
    var sched = dir ? SCHEDULE[dir] : null;

    if (!sched) {
      currentGroups = [];
      if (daySection) daySection.style.display = 'none';
      if (timeSection) {
        if (dir && dir !== 'any') {
          timeSection.style.display = '';
          if (slotChipsEl) slotChipsEl.innerHTML = '';
          if (schedNote) { schedNote.textContent = 'Группа формируется — время подберём при звонке'; schedNote.style.display = ''; }
        } else {
          timeSection.style.display = 'none';
        }
      }
      return;
    }

    currentGroups = sched.groups(age);
    var days = [];
    currentGroups.forEach(function (g) {
      g.days.forEach(function (d) { if (days.indexOf(d) === -1) days.push(d); });
    });

    if (daySection && dayChipsEl) {
      renderDateChips(dayChipsEl, days);
      daySection.style.display = '';
    }
    if (timeSection && slotChipsEl) {
      renderSlots();
      timeSection.style.display = '';
      if (schedNote) schedNote.style.display = 'none';
    }
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.form-chip');
    if (!chip) return;
    if (dirChipsEl && dirChipsEl.contains(chip)) setTimeout(update, 0);
    else if (whoChipsEl && whoChipsEl.contains(chip)) setTimeout(applyWho, 0);
    else if (dayChipsEl && dayChipsEl.contains(chip)) setTimeout(renderSlots, 0);
  });
  if (ageInput) ageInput.addEventListener('input', update);
}

document.addEventListener('DOMContentLoaded', () => {
  ['trial-form', 'callback-form', 'course-form', 'modal-form'].forEach(id => setupForm(id));
  applyDirectorSlots();
  applyDirectorPricing();
  applyDirectorContacts();
  renderReviews();
  renderValues();
  applyTextOverrides();
  renderHeroVideo();
  initScheduleForm('modal-form');
});

/* ===== EDITABLE SITE TEXTS (data-tx) =====
   Any element carrying data-tx="<key>" can be overridden from the admin
   panel (account/admin-texts.html → site_texts table). The HTML keeps a
   sensible default so the page never looks empty if Supabase is empty or
   unreachable — same graceful-degradation contract as renderReviews(). */
function applyTextOverrides() {
  const nodes = document.querySelectorAll('[data-tx]');
  if (!nodes.length || !window.SUPA || !SUPA.texts) return;
  SUPA.texts.getAll().then((map) => {
    if (!map) return;
    nodes.forEach((el) => {
      const key = el.getAttribute('data-tx');
      const val = map[key];
      if (val != null && String(val).trim() !== '') el.innerHTML = val;
    });
  }).catch(() => {}); /* keep static defaults */
}

/* ===== HERO VIDEO =====
   The right-hand hero panel plays a montage reel. #hero-media ships with a
   default embed in the HTML; if the admin published a video to media_items
   (section 'home', subsection 'hero') it replaces the default. Empty/
   unreachable → the built-in default stays. */
/* Speaker icons for the sound toggle. */
const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>';
const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';

/* Hero video. Reads the admin override (media_items home/hero); otherwise
   uses the default in data-hero-default. A poster layer sits on top and only
   fades once the video is actually playing, so the visitor never sees the
   black loading square — the picture appears seamlessly. */
function renderHeroVideo() {
  const box = document.getElementById('hero-media');
  if (!box) return;
  const def = box.getAttribute('data-hero-default') || '';
  const go = (url, kind, thumb) => mountHeroVideo(box, url, kind, thumb);
  if (window.SUPA && SUPA.media) {
    SUPA.media.listBySection('home', 'hero').then((list) => {
      if (Array.isArray(list) && list.length) go(list[0].url, list[0].kind, list[0].thumb_url);
      else go(def, '', '');
    }).catch(() => go(def, '', ''));
  } else {
    go(def, '', '');
  }
}

function ytId(u) {
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

/* Build the hero player inside `box`. Prefers a native <video> (mp4/webm) or
   a chrome-less Vimeo/YouTube background. Adds a poster overlay (fades on
   play) and a subtle sound toggle that works for <video> and YouTube. */
function mountHeroVideo(box, url, kind, thumb) {
  const u = String(url || '');
  if (!u) return;
  const isFile = kind === 'video' || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);
  const isImg = kind === 'image' || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(u);
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  const yid = ytId(u);

  box.innerHTML = '';
  box.classList.remove('is-playing');

  // poster (instant, no black flash) — YouTube gives us a free thumbnail
  const posterUrl = thumb || (yid ? 'https://img.youtube.com/vi/' + yid + '/maxresdefault.jpg' : '');
  const poster = document.createElement('div');
  poster.className = 'hero-ed-poster';
  if (posterUrl) poster.style.backgroundImage = "url('" + posterUrl + "')";

  const reveal = () => box.classList.add('is-playing');

  if (isImg) {
    const img = document.createElement('img');
    img.src = u; img.alt = 'Студия';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    box.appendChild(img); reveal(); return;
  }

  const soundBtn = document.createElement('button');
  soundBtn.type = 'button'; soundBtn.className = 'hero-ed-sound';
  soundBtn.setAttribute('aria-label', 'Включить звук'); soundBtn.innerHTML = SND_OFF;

  if (isFile) {
    const v = document.createElement('video');
    v.src = u; v.autoplay = true; v.muted = true; v.loop = true;
    v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    if (posterUrl) v.setAttribute('poster', posterUrl);
    box.appendChild(v); box.appendChild(poster); box.appendChild(soundBtn);
    v.addEventListener('playing', reveal); v.addEventListener('loadeddata', reveal);
    const toggle = (e) => {
      if (e) e.stopPropagation();
      v.muted = !v.muted;
      if (!v.muted && v.paused) { try { v.play(); } catch (_) {} }
      soundBtn.innerHTML = v.muted ? SND_OFF : SND_ON;
      soundBtn.setAttribute('aria-label', v.muted ? 'Включить звук' : 'Выключить звук');
    };
    soundBtn.addEventListener('click', toggle);
    box.addEventListener('click', (e) => { if (!soundBtn.contains(e.target)) toggle(); });
    return;
  }

  if (vm) {
    const ifr = document.createElement('iframe');
    ifr.src = 'https://player.vimeo.com/video/' + vm[1] + '?autoplay=1&muted=1&loop=1&background=1';
    ifr.title = 'Видео студии'; ifr.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    ifr.allowFullscreen = true; ifr.loading = 'lazy';
    box.appendChild(ifr); box.appendChild(poster);
    ifr.addEventListener('load', () => setTimeout(reveal, 300)); // background player: no sound control
    return;
  }

  if (yid) {
    // Use the IFrame API so we can unmute on click and reveal exactly on play.
    const holder = document.createElement('div');
    box.appendChild(holder); box.appendChild(poster); box.appendChild(soundBtn);
    loadYouTubeAPI(() => {
      const player = new YT.Player(holder, {
        width: '100%', height: '100%', videoId: yid,
        playerVars: { autoplay: 1, mute: 1, loop: 1, playlist: yid, controls: 0, rel: 0,
          modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: (e) => { try { e.target.mute(); e.target.playVideo(); } catch (_) {} },
          onStateChange: (e) => { if (e.data === YT.PlayerState.PLAYING) reveal(); }
        }
      });
      const toggle = (e) => {
        if (e) e.stopPropagation();
        const muted = player.isMuted();
        if (muted) { player.unMute(); player.setVolume(100); } else { player.mute(); }
        soundBtn.innerHTML = muted ? SND_ON : SND_OFF;
        soundBtn.setAttribute('aria-label', muted ? 'Выключить звук' : 'Включить звук');
      };
      soundBtn.addEventListener('click', toggle);
      box.addEventListener('click', (e) => { if (!soundBtn.contains(e.target)) toggle(); });
    });
    return;
  }

  // generic URL fallback
  const ifr = document.createElement('iframe');
  ifr.src = u; ifr.title = 'Видео студии'; ifr.loading = 'lazy';
  box.appendChild(ifr); reveal();
}

/* Load the YouTube IFrame Player API once; queue callbacks until ready. */
function loadYouTubeAPI(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  (window.__ytCbs = window.__ytCbs || []).push(cb);
  if (window.__ytLoading) return;
  window.__ytLoading = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    if (typeof prev === 'function') prev();
    (window.__ytCbs || []).forEach((f) => { try { f(); } catch (_) {} });
    window.__ytCbs = [];
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

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
  const id = trialIdentity(form);
  const data = id.data;
  const dirGroup = form.querySelector('[data-chip-role="direction"]');
  const dirChip = dirGroup ? dirGroup.querySelector('.form-chip.selected') : null;
  const direction = dirChip ? (CHIP_DIRECTION[dirChip.dataset.value] !== undefined && CHIP_DIRECTION[dirChip.dataset.value] !== ''
    ? CHIP_DIRECTION[dirChip.dataset.value] : dirChip.textContent.trim()) : '';
  const dayChip = form.querySelector('[data-chip-role="day"] .form-chip.selected');
  const slotChip = form.querySelector('[data-chip-role="slot"] .form-chip.selected');
  const lines = ['Здравствуйте! Хочу записаться на бесплатное пробное занятие.'];
  if (id.who === 'child') {
    if (id.name) lines.push('Ребёнок: ' + id.name);
    if (id.parentName) lines.push('Родитель: ' + id.parentName);
  } else if (id.name) {
    lines.push('Имя: ' + id.name);
  }
  if (id.phone) lines.push('Телефон: ' + id.phone);
  if (id.who === 'adult') lines.push('Возраст: 18+');
  else if (id.age) lines.push('Возраст: ' + id.age);
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

/* ===== VALUES (studio_values via Supabase) [Phase 1] =====
   #values-grid ships with static fallback cards in the HTML. If SUPA is
   loaded and returns rows, we replace them; otherwise the static markup
   stays — same graceful-degradation contract as renderReviews(). */
const VALUE_ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>'
};

function renderValues() {
  const grid = document.getElementById('values-grid');
  if (!grid || !window.SUPA || !SUPA.values) return;
  SUPA.values.listActive().then((list) => {
    if (!Array.isArray(list) || !list.length) return; /* keep static fallback markup */
    grid.innerHTML = list.map((v) => {
      const icon = VALUE_ICONS[v.icon] || VALUE_ICONS.star;
      return '<div class="par-card fade-up">' +
        '<div class="par-ico">' + icon + '</div>' +
        '<h3>' + escapeHtml(v.title || '') + '</h3>' +
        '<p>' + escapeHtml(v.description || '') + '</p>' +
        '</div>';
    }).join('');
  }).catch(() => {}); /* keep static fallback markup */
}

/* Reviews now live in the real Supabase `reviews` table (see
   supabase/migrations/0024_reviews.sql), not localStorage. #reviews-grid
   ships with static fallback cards in the HTML; if a grid carries
   data-direction, only that direction's approved reviews are shown
   (used on directions/*.html). Same graceful-degradation contract as
   renderValues(): empty/unreachable → static markup stays. */
function renderReviews() {
  const grid = document.getElementById('reviews-grid');
  if (!grid || !window.SUPA || !SUPA.reviews) return;
  const direction = grid.dataset.direction || null;
  SUPA.reviews.listApproved(direction).then((list) => {
    if (!Array.isArray(list) || !list.length) return; /* keep static fallback markup */
    grid.innerHTML = list.map(r => {
      const n = Math.max(1, Math.min(5, parseInt(r.rating, 10) || 5));
      const stars = '★★★★★'.slice(0, n);
      const name = (r.author_name || 'Родитель').trim();
      const avatar = name.charAt(0).toUpperCase();
      const roleLabel = CHIP_DIRECTION[r.direction] || '';
      const video = r.video_url
        ? '<a href="' + escapeHtml(r.video_url) + '" target="_blank" rel="noopener" class="review-video-link">▶ Смотреть видео</a>'
        : '';
      return '<div class="review-card fade-up" data-dir="' + escapeHtml(r.direction || '') + '">' +
        '<div class="review-stars">' + stars + '</div>' +
        '<p class="review-text">' + escapeHtml(r.body || '') + '</p>' +
        video +
        '<div class="review-author">' +
        (r.photo_url
          ? '<img class="review-author-avatar" src="' + escapeHtml(r.photo_url) + '" alt="">'
          : '<div class="review-author-avatar">' + escapeHtml(avatar) + '</div>') +
        '<div><div class="review-author-name">' + escapeHtml(name) + '</div>' +
        '<div class="review-author-role">' + escapeHtml(roleLabel) + '</div></div>' +
        '</div></div>';
    }).join('');
  }).catch(() => {}); /* keep static fallback markup */
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
