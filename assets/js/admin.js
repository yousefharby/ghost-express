/* Ghost Express — admin panel: requests, messages, prices, site settings. */
(function () {
  'use strict';
  var GX = (window.GX = window.GX || {});
  var $ = GX.$, $$ = GX.$$, el = GX.el, icon = GX.icon;

  var TITLES = { overview: 'نظرة عامة', registrations: 'طلبات فتح حساب', messages: 'الرسائل', prices: 'الأسعار', settings: 'بيانات الموقع', security: 'كلمة المرور' };
  var state = {
    view: 'overview',
    data: { registrations: [], messages: [] },
    filter: { registrations: 'all', messages: 'all' },
    q: { registrations: '', messages: '' }
  };

  GX.admin = { mounted: false, mount: mount };

  function statusName(kind, id) {
    var s = GX.statuses[kind].filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id || '';
  }
  function pillClass(id) {
    return { new: 'pill--new', contacted: 'pill--go', active: 'pill--ok', rejected: 'pill--bad', read: 'pill--go', done: 'pill--ok' }[id] || 'pill--muted';
  }
  function friendly(err, fallback) {
    var m = err && err.message;
    if (m && /[\u0600-\u06FF]/.test(m)) return m;
    if (err && err.code === 'invalid_argument') return 'مفيش صلاحية حفظ هنا. افتح المعاينة من حساب صاحب الموقع.';
    return fallback || 'حصلت مشكلة، جرب تاني.';
  }
  function isAuthError(err) { return err && (err.code === 'auth' || err.status === 401); }
  function handle(err, statusEl, fallback) {
    if (isAuthError(err)) { showLogin('الجلسة خلصت. ادخل كلمة المرور تاني.'); return; }
    var msg = friendly(err, fallback);
    if (statusEl) { statusEl.classList.remove('is-ok'); statusEl.textContent = msg; }
    else GX.toast(msg, 'info');
  }
  function okStatus(statusEl, msg) { statusEl.classList.add('is-ok'); statusEl.textContent = msg; GX.toast(msg); }

  /* ---------- mount / auth ---------- */
  function mount() {
    if (GX.admin.mounted) return;
    GX.admin.mounted = true;
    bindLogin();
    bindShell();
    GX.store.ready.then(function () {
      renderMode();
      return GX.store.session();
    }).then(function (ok) { if (ok) enter(); else showLogin(); });
  }

  function renderMode() {
    var mode = GX.store.mode;
    var box = $('#adm-mode');
    var hint = $('#adm-hint');
    box.setAttribute('data-mode', mode);
    box.textContent = '';
    var texts = {
      php: ['متصل بالسيرفر', 'الطلبات والرسائل والتعديلات بتتحفظ على الاستضافة.'],
      cloud: ['وضع المعاينة', 'البيانات محفوظة في المعاينة دي. بعد رفع الموقع هتتحفظ على الاستضافة.'],
      local: ['وضع تجريبي', 'البيانات على المتصفح ده بس. ارفع الموقع على استضافة فيها PHP عشان الطلبات توصلك.']
    };
    var t = texts[mode] || texts.local;
    box.append(el('b', { text: t[0] }), el('span', { text: t[1] }));
    if (mode !== 'php') {
      hint.textContent = '';
      hint.append('كلمة مرور المعاينة لو مغيرتهاش: ', el('b', { class: 'ltr', text: GX.DEMO_PASSWORD }));
      hint.hidden = false;
    }
    $$('[data-export]').forEach(function (b) { b.hidden = mode === 'cloud'; });
  }

  function showLogin(msg) {
    $('#adm-app').hidden = true;
    $('#adm-login').hidden = false;
    $('#adm-login-err').textContent = msg || '';
    var p = $('#adm-pass');
    p.value = '';
    setTimeout(function () { p.focus(); }, 30);
  }

  function bindLogin() {
    $('#adm-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pass = $('#adm-pass').value;
      var err = $('#adm-login-err');
      if (!pass) { err.textContent = 'اكتب كلمة المرور.'; return; }
      var btn = $('button[type="submit"]', e.target);
      btn.disabled = true;
      err.textContent = '';
      GX.store.login(pass).then(function () { enter(); }).catch(function (x) {
        err.textContent = friendly(x, 'كلمة المرور مش صحيحة.');
      }).then(function () { btn.disabled = false; });
    });
  }

  function enter() {
    $('#adm-login').hidden = true;
    $('#adm-app').hidden = false;
    fillPrices(GX.prices);
    fillSettings(GX.settings);
    go(state.view);
    loadAll();
  }

  /* ---------- shell ---------- */
  function bindShell() {
    $$('.adm-nav [data-view]').forEach(function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-view')); }); });
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]');
      if (g && g.closest('.adm')) go(g.getAttribute('data-go'));
    });
    $('#adm-refresh').addEventListener('click', function () { loadAll(true); });
    $('#adm-logout').addEventListener('click', function () { GX.store.logout().then(function () { showLogin(); }); });
    ['registrations', 'messages'].forEach(function (kind) {
      var q = $(kind === 'registrations' ? '#adm-reg-q' : '#adm-msg-q');
      q.addEventListener('input', function () { state.q[kind] = q.value.trim(); renderList(kind); });
    });
    $$('[data-export]').forEach(function (b) { b.addEventListener('click', function () { exportCsv(b.getAttribute('data-export')); }); });
    bindPrices();
    bindSettings();
    bindPassword();
  }

  function go(view) {
    if (!TITLES[view]) view = 'overview';
    state.view = view;
    $$('.adm-nav [data-view]').forEach(function (b) {
      if (b.getAttribute('data-view') === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $$('.adm-view').forEach(function (v) { v.hidden = v.getAttribute('data-panel') !== view; });
    $('#adm-title').textContent = TITLES[view];
    $('#adm-refresh').hidden = !(view === 'overview' || view === 'registrations' || view === 'messages');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ---------- data ---------- */
  function loadAll(announce) {
    return Promise.all([GX.store.list('registrations'), GX.store.list('messages')]).then(function (r) {
      state.data.registrations = sortItems(r[0]);
      state.data.messages = sortItems(r[1]);
      renderAll();
      if (announce) GX.toast('اتحدثت البيانات');
    }).catch(function (e) { handle(e, null, 'معرفناش نجيب البيانات. جرب تحديث.'); renderAll(); });
  }
  function sortItems(items) {
    return (items || []).slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  }
  function renderAll() {
    renderOverview();
    renderList('registrations');
    renderList('messages');
    ['registrations', 'messages'].forEach(function (kind) {
      var n = state.data[kind].filter(function (x) { return (x.status || 'new') === 'new'; }).length;
      var b = $('[data-badge="' + kind + '"]');
      b.textContent = String(n);
      b.hidden = !n;
    });
  }

  function renderOverview() {
    var R = state.data.registrations, M = state.data.messages;
    var newR = R.filter(function (x) { return (x.status || 'new') === 'new'; }).length;
    var newM = M.filter(function (x) { return (x.status || 'new') === 'new'; }).length;
    var tiles = $('#adm-tiles');
    tiles.textContent = '';
    [
      ['طلبات حساب جديدة', newR, 'registrations', newR > 0],
      ['رسائل جديدة', newM, 'messages', newM > 0],
      ['كل طلبات فتح الحساب', R.length, 'registrations', false],
      ['كل الرسائل', M.length, 'messages', false]
    ].forEach(function (t) {
      tiles.append(el('button', { type: 'button', class: 'adm-tile' + (t[3] ? ' is-hot' : ''), 'data-go': t[2] }, [el('span', { text: t[0] }), el('b', { text: String(t[1]) })]));
    });
    mini($('#adm-latest-reg'), R.slice(0, 5), 'registrations', function (x) { return [x.name, (x.store || '') + ' · ' + (x.governorate || '')]; }, 'لسه مفيش طلبات فتح حساب.', 'أول ما حد يسجل من صفحة "افتح حساب" هيظهر هنا.');
    mini($('#adm-latest-msg'), M.slice(0, 5), 'messages', function (x) { return [x.name, (x.type || '') + ' · ' + (x.message || '')]; }, 'لسه مفيش رسائل.', 'الرسائل اللي بتتبعت من صفحة "تواصل معانا" بتظهر هنا.');
  }
  function mini(ul, items, kind, fmt, emptyTitle, emptyText) {
    ul.textContent = '';
    if (!items.length) { ul.append(el('li', { class: 'adm-empty', style: 'display:grid' }, [el('b', { text: emptyTitle }), el('span', { text: emptyText })])); return; }
    items.forEach(function (x) {
      var f = fmt(x);
      ul.append(el('li', null, [el('b', { text: f[0] || '—' }), el('span', { class: 'pill ' + pillClass(x.status || 'new'), text: statusName(kind, x.status || 'new') }), el('span', { text: f[1] + ' · ' + GX.date(x.createdAt) })]));
    });
  }

  function matches(x, q) {
    if (!q) return true;
    q = GX.digits(q).toLowerCase();
    return Object.keys(x).some(function (k) { return k !== 'id' && String(x[k] == null ? '' : x[k]).toLowerCase().indexOf(q) > -1; });
  }
  function renderFilter(kind) {
    var box = $(kind === 'registrations' ? '#adm-reg-filter' : '#adm-msg-filter');
    var all = state.data[kind];
    box.textContent = '';
    [{ id: 'all', name: 'الكل' }].concat(GX.statuses[kind]).forEach(function (s) {
      var n = s.id === 'all' ? all.length : all.filter(function (x) { return (x.status || 'new') === s.id; }).length;
      var b = el('button', { type: 'button', 'aria-pressed': state.filter[kind] === s.id ? 'true' : 'false' }, [s.name, el('em', { text: String(n) })]);
      b.addEventListener('click', function () { state.filter[kind] = s.id; renderList(kind); });
      box.append(b);
    });
  }
  function renderList(kind) {
    renderFilter(kind);
    var box = $(kind === 'registrations' ? '#adm-reg-list' : '#adm-msg-list');
    var f = state.filter[kind], q = state.q[kind];
    var items = state.data[kind].filter(function (x) { return (f === 'all' || (x.status || 'new') === f) && matches(x, q); });
    box.textContent = '';
    if (!items.length) {
      var total = state.data[kind].length;
      box.append(el('div', { class: 'adm-empty' }, total
        ? [el('b', { text: 'مفيش نتايج' }), el('span', { text: 'جرب كلمة بحث تانية أو اختار "الكل".' })]
        : kind === 'registrations'
          ? [el('b', { text: 'لسه مفيش طلبات فتح حساب' }), el('span', { text: 'الطلبات اللي بتتبعت من صفحة "افتح حساب" بتظهر هنا، ومعاها زرار واتساب واتصال.' })]
          : [el('b', { text: 'لسه مفيش رسائل' }), el('span', { text: 'الرسائل اللي بتتبعت من صفحة "تواصل معانا" بتظهر هنا.' })]));
      return;
    }
    items.forEach(function (x) { box.append(kind === 'registrations' ? regCard(x) : msgCard(x)); });
  }

  function field(label, value, opts) {
    if (!value) return null;
    opts = opts || {};
    var dd = el('dd', { class: opts.ltr ? 'ltr' : null });
    if (opts.href) dd.append(el('a', { href: opts.href, target: '_blank', rel: 'noopener', text: value }));
    else dd.textContent = value;
    return el('div', { class: opts.wide ? 'wide' : null }, [el('dt', { text: label }), dd]);
  }
  function pageHref(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    return GX.safeUrl(v);
  }
  function actions(kind, x, waText) {
    var wrap = el('div', { class: 'rec-actions' });
    var phone = x.whatsapp || x.phone;
    if (GX.intl(phone)) wrap.append(el('a', { class: 'btn btn--sm btn--wa', href: GX.wa(waText, phone), target: '_blank', rel: 'noopener' }, [icon('chat'), 'واتساب']));
    if (GX.intl(x.phone)) wrap.append(el('a', { class: 'btn btn--sm btn--line-dark', href: GX.tel(x.phone) }, [icon('phone'), 'اتصال']));
    var selId = 'st-' + kind + '-' + x.id;
    var sel = el('select', { class: 'select select--sm', id: selId, 'aria-label': 'الحالة' });
    GX.statuses[kind].forEach(function (s) { sel.append(el('option', { value: s.id, text: s.name })); });
    sel.value = x.status || 'new';
    sel.addEventListener('change', function () {
      var v = sel.value;
      GX.store.update(kind, x.id, { status: v }).then(function () {
        x.status = v;
        GX.toast('الحالة بقت: ' + statusName(kind, v));
        renderAll();
      }).catch(function (e) { sel.value = x.status || 'new'; handle(e); });
    });
    var del = el('button', { type: 'button', class: 'btn btn--sm btn--line-dark rec-del' }, [icon('trash'), el('span', { text: 'حذف' })]);
    del.addEventListener('click', function () {
      if (!del.classList.contains('is-armed')) {
        del.classList.add('is-armed');
        $('span', del).textContent = 'اضغط تاني للتأكيد';
        clearTimeout(del._t);
        del._t = setTimeout(function () { del.classList.remove('is-armed'); $('span', del).textContent = 'حذف'; }, 4000);
        return;
      }
      del.disabled = true;
      GX.store.remove(kind, x.id).then(function () {
        state.data[kind] = state.data[kind].filter(function (it) { return it.id !== x.id; });
        GX.toast('اتحذف');
        renderAll();
      }).catch(function (e) { del.disabled = false; handle(e); });
    });
    wrap.append(sel, del);
    return wrap;
  }
  function regCard(x) {
    var first = String(x.name || '').split(' ')[0];
    return el('article', { class: 'rec', 'data-status': x.status || 'new' }, [
      el('header', null, [
        el('div', { class: 'rec-who' }, [el('b', { text: x.name || '—' }), el('span', { text: [x.store, x.category].filter(Boolean).join(' · ') })]),
        el('span', { class: 'pill ' + pillClass(x.status || 'new'), text: statusName('registrations', x.status || 'new') })
      ]),
      el('dl', { class: 'rec-fields' }, [
        field('الموبايل', x.phone, { ltr: true }),
        x.whatsapp && x.whatsapp !== x.phone ? field('واتساب', x.whatsapp, { ltr: true }) : null,
        field('المحافظة والمنطقة', [x.governorate, x.area].filter(Boolean).join(' — ')),
        field('عدد الشحنات في الشهر', x.volume),
        field('الصفحة أو الموقع', x.page, { href: pageHref(x.page), ltr: true }),
        field('الإيميل', x.email, { ltr: true }),
        field('العنوان', x.address, { wide: true }),
        field('ملاحظات', x.notes, { wide: true })
      ]),
      el('footer', null, [
        el('span', { class: 'rec-date', text: 'اتبعت ' + GX.date(x.createdAt) }),
        actions('registrations', x, 'أهلاً ' + first + '، معاك جوست إكسبريس بخصوص طلب فتح حساب لمتجر ' + (x.store || '') + '.')
      ])
    ]);
  }
  function msgCard(x) {
    var first = String(x.name || '').split(' ')[0];
    return el('article', { class: 'rec', 'data-status': x.status || 'new' }, [
      el('header', null, [
        el('div', { class: 'rec-who' }, [el('b', { text: x.name || '—' }), el('span', { text: x.type || '' })]),
        el('span', { class: 'pill ' + pillClass(x.status || 'new'), text: statusName('messages', x.status || 'new') })
      ]),
      el('dl', { class: 'rec-fields' }, [
        field('الموبايل', x.phone, { ltr: true }),
        field('الرسالة', x.message, { wide: true })
      ]),
      el('footer', null, [
        el('span', { class: 'rec-date', text: 'اتبعتت ' + GX.date(x.createdAt) }),
        actions('messages', x, 'أهلاً ' + first + '، معاك جوست إكسبريس بخصوص رسالتك.')
      ])
    ]);
  }

  /* ---------- export ---------- */
  function exportCsv(kind) {
    var cols = kind === 'registrations'
      ? [['createdAt', 'التاريخ'], ['status', 'الحالة'], ['name', 'الاسم'], ['phone', 'الموبايل'], ['whatsapp', 'واتساب'], ['email', 'الإيميل'], ['store', 'المتجر'], ['page', 'الصفحة'], ['category', 'النشاط'], ['volume', 'عدد الشحنات'], ['governorate', 'المحافظة'], ['area', 'المنطقة'], ['address', 'العنوان'], ['notes', 'ملاحظات']]
      : [['createdAt', 'التاريخ'], ['status', 'الحالة'], ['name', 'الاسم'], ['phone', 'الموبايل'], ['type', 'الموضوع'], ['message', 'الرسالة']];
    var esc = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var rows = [cols.map(function (c) { return esc(c[1]); }).join(',')];
    state.data[kind].forEach(function (x) {
      rows.push(cols.map(function (c) {
        var v = x[c[0]];
        if (c[0] === 'status') v = statusName(kind, v || 'new');
        if (c[0] === 'createdAt') v = GX.date(v);
        return esc(v);
      }).join(','));
    });
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'ghost-express-' + kind + '-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.append(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- prices editor ---------- */
  function fillPrices(p) {
    var tiers = $('#adm-tiers');
    tiers.textContent = '';
    p.tiers.forEach(function (t, i) {
      tiers.append(el('fieldset', null, [
        el('legend', { text: 'الباقة ' + (i + 1) }),
        el('div', { class: 'field' }, [el('label', { for: 'tier-name-' + t.id, text: 'الاسم' }), el('input', { class: 'input', id: 'tier-name-' + t.id, value: t.name })]),
        el('div', { class: 'field' }, [el('label', { for: 'tier-range-' + t.id, text: 'عدد الشحنات' }), el('input', { class: 'input', id: 'tier-range-' + t.id, value: t.range })])
      ]));
    });
    var table = $('#adm-zones');
    table.textContent = '';
    var head = el('tr', null, [el('th', { scope: 'col', text: 'المنطقة' }), el('th', { scope: 'col', text: 'مدة التوصيل' })]);
    p.tiers.forEach(function (t) { head.append(el('th', { scope: 'col', 'data-tier-head': t.id, text: t.name + ' (ج.م)' })); });
    var body = el('tbody');
    p.zones.forEach(function (z) {
      var tr = el('tr', null, [
        el('td', null, [el('input', { class: 'input zname', id: 'zone-name-' + z.id, value: z.name, 'aria-label': 'اسم المنطقة' })]),
        el('td', null, [el('input', { class: 'input ztime', id: 'zone-time-' + z.id, value: z.time, 'aria-label': 'مدة التوصيل لـ ' + z.name })])
      ]);
      p.tiers.forEach(function (t) {
        tr.append(el('td', null, [el('input', { class: 'input ltr-in', type: 'number', min: '0', step: '1', inputmode: 'numeric', id: 'zone-' + z.id + '-' + t.id, value: String(z.prices[t.id]), 'aria-label': 'سعر ' + z.name + ' في باقة ' + t.name })]));
      });
      body.append(tr);
    });
    table.append(el('thead', null, [head]), body);
    $('#adm-notes').value = p.notes.join('\n');
  }
  function readPrices() {
    var base = GX.prices;
    var bad = null;
    var p = {
      tiers: base.tiers.map(function (t) {
        return { id: t.id, name: $('#tier-name-' + t.id).value.trim() || t.name, range: $('#tier-range-' + t.id).value.trim() || t.range };
      }),
      zones: base.zones.map(function (z) {
        var prices = {};
        base.tiers.forEach(function (t) {
          var inp = $('#zone-' + z.id + '-' + t.id);
          var v = Number(GX.digits(inp.value));
          if (!isFinite(v) || v < 0 || inp.value === '') { inp.setAttribute('aria-invalid', 'true'); if (!bad) bad = inp; }
          else inp.setAttribute('aria-invalid', 'false');
          prices[t.id] = Math.round(v * 100) / 100;
        });
        return { id: z.id, name: $('#zone-name-' + z.id).value.trim() || z.name, time: $('#zone-time-' + z.id).value.trim() || z.time, prices: prices };
      }),
      notes: $('#adm-notes').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12)
    };
    if (bad) { bad.focus(); return null; }
    return p;
  }
  function bindPrices() {
    var form = $('#adm-prices-form'), status = $('#adm-prices-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      var p = readPrices();
      if (!p) { status.classList.remove('is-ok'); status.textContent = 'في سعر فاضي أو غلط. اكتب رقم (0 أو أكتر) في كل الخانات.'; return; }
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;
      GX.store.savePrices(p).then(function () {
        GX.applyConfig({ settings: GX.settings, prices: p });
        fillPrices(GX.prices);
        okStatus(status, 'الأسعار اتحفظت وبقت ظاهرة في الموقع.');
      }).catch(function (x) { handle(x, status, 'معرفناش نحفظ الأسعار.'); }).then(function () { btn.disabled = false; });
    });
    var reset = $('#adm-prices-reset');
    reset.addEventListener('click', function () {
      if (!reset.classList.contains('is-armed')) {
        reset.classList.add('is-armed');
        reset.textContent = 'متأكد؟ اضغط تاني';
        clearTimeout(reset._t);
        reset._t = setTimeout(function () { reset.classList.remove('is-armed'); reset.textContent = 'رجوع للأسعار الأصلية'; }, 4000);
        return;
      }
      reset.classList.remove('is-armed');
      reset.textContent = 'رجوع للأسعار الأصلية';
      fillPrices(GX.normalizePrices(GX.defaults.prices));
      status.classList.remove('is-ok');
      status.textContent = 'الأسعار الأصلية اتحطت في الجدول. اضغط "حفظ الأسعار" عشان تتطبق على الموقع.';
    });
  }

  /* ---------- settings editor ---------- */
  function fillSettings(s) {
    $$('#adm-settings-form [data-key]').forEach(function (inp) { inp.value = s[inp.getAttribute('data-key')] || ''; inp.setAttribute('aria-invalid', 'false'); });
    var box = $('#adm-stats');
    box.textContent = '';
    for (var i = 0; i < 4; i++) {
      var st = s.stats[i] || { value: '', label: '' };
      box.append(el('fieldset', null, [
        el('legend', { text: 'الرقم ' + (i + 1) }),
        el('div', { class: 'field' }, [el('label', { for: 'stat-v-' + i, text: 'الرقم' }), el('input', { class: 'input', id: 'stat-v-' + i, value: st.value })]),
        el('div', { class: 'field' }, [el('label', { for: 'stat-l-' + i, text: 'الوصف' }), el('input', { class: 'input', id: 'stat-l-' + i, value: st.label })])
      ]));
    }
  }
  function setErr(inp, msg) {
    inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var e = document.getElementById(inp.id + '-err');
    if (e) e.textContent = msg || '';
  }
  function bindSettings() {
    var form = $('#adm-settings-form'), status = $('#adm-settings-status');
    form.addEventListener('input', function (e) { if (e.target.getAttribute('aria-invalid') === 'true') setErr(e.target, ''); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      var s = JSON.parse(JSON.stringify(GX.settings));
      var first = null;
      $$('[data-key]', form).forEach(function (inp) {
        var k = inp.getAttribute('data-key');
        var v = inp.value.trim();
        var msg = '';
        if (k === 'phone') { v = GX.digits(v).replace(/[^\d+]/g, ''); if (!/^\+?\d{8,13}$/.test(v)) msg = 'اكتب رقم تليفون صحيح.'; }
        if (k === 'whatsapp' && v) { v = GX.normPhone(v); if (!GX.validMobile(v)) msg = 'رقم الواتساب لازم يكون موبايل مصري من 11 رقم.'; }
        if (k === 'email' && v && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) msg = 'اكتب إيميل صحيح أو سيبه فاضي.';
        if (inp.hasAttribute('data-url') && v && !GX.safeUrl(v)) msg = 'اللينك لازم يبدأ بـ https://';
        setErr(inp, msg);
        if (msg && !first) first = inp;
        s[k] = v;
      });
      if (first) { first.focus(); status.classList.remove('is-ok'); status.textContent = 'في خانات محتاجة تتصلح، موضحة باللون الأحمر.'; return; }
      s.stats = [0, 1, 2, 3].map(function (i) { return { value: $('#stat-v-' + i).value.trim(), label: $('#stat-l-' + i).value.trim() }; });
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;
      GX.store.saveSettings(s).then(function () {
        GX.applyConfig({ settings: s, prices: GX.prices });
        okStatus(status, 'البيانات اتحفظت وبقت ظاهرة في الموقع.');
      }).catch(function (x) { handle(x, status, 'معرفناش نحفظ البيانات.'); }).then(function () { btn.disabled = false; });
    });
  }

  /* ---------- password ---------- */
  function bindPassword() {
    var form = $('#adm-pass-form'), status = $('#adm-pass-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      var cur = $('#pw-current'), next = $('#pw-next'), again = $('#pw-again');
      setErr(cur, cur.value ? '' : 'اكتب كلمة المرور الحالية.');
      setErr(next, next.value.length >= 8 ? '' : 'كلمة المرور الجديدة لازم تبقى 8 حروف أو أرقام على الأقل.');
      setErr(again, again.value === next.value ? '' : 'الكلمتين مش زي بعض.');
      var bad = [cur, next, again].filter(function (i) { return i.getAttribute('aria-invalid') === 'true'; })[0];
      if (bad) { bad.focus(); return; }
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;
      GX.store.changePassword(cur.value, next.value).then(function () {
        form.reset();
        okStatus(status, 'كلمة المرور اتغيرت.');
      }).catch(function (x) { handle(x, status, 'معرفناش نغير كلمة المرور.'); }).then(function () { btn.disabled = false; });
    });
  }

  /* admin.js loads after site.js: mount now if the admin page is the one showing */
  if (document.querySelector('main[data-page="admin"]:not([hidden])')) mount();
})();
