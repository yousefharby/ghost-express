/* Ghost Express — site behaviour (header, prices, map, forms, tracking). */
(function () {
  'use strict';
  var GX = (window.GX = window.GX || {});
  var doc = document;
  var NS = 'http://www.w3.org/2000/svg';

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  GX.$ = $;
  GX.$$ = $$;

  /* ---------- DOM helpers (text only, never raw HTML from data) ---------- */
  function el(tag, opts, kids) {
    var n = doc.createElement(tag);
    if (opts) {
      Object.keys(opts).forEach(function (k) {
        var v = opts[k];
        if (v == null || v === false) return;
        if (k === 'text') n.textContent = v;
        else if (k === 'class') n.className = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (kids || []).forEach(function (c) { if (c != null) n.append(c); });
    return n;
  }
  function icon(name, cls) {
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = doc.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }
  GX.el = el;
  GX.icon = icon;

  /* ---------- formatting & contact helpers ---------- */
  GX.digits = function (s) {
    return String(s == null ? '' : s)
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  };
  GX.normPhone = function (s) {
    var d = GX.digits(s).replace(/[^\d+]/g, '');
    if (d.indexOf('+20') === 0) d = '0' + d.slice(3);
    else if (d.indexOf('0020') === 0) d = '0' + d.slice(4);
    else if (d.indexOf('20') === 0 && d.length === 12) d = '0' + d.slice(2);
    return d.replace(/\D/g, '');
  };
  GX.validMobile = function (s) { return /^01[0125]\d{8}$/.test(GX.normPhone(s)); };
  GX.intl = function (s) { var n = GX.normPhone(s); return n ? '20' + n.replace(/^0/, '') : ''; };
  GX.tel = function (s) { var i = GX.intl(s); return i ? 'tel:+' + i : ''; };
  GX.wa = function (text, num) {
    var i = GX.intl(num || GX.settings.whatsapp || GX.settings.phone);
    return i ? 'https://wa.me/' + i + (text ? '?text=' + encodeURIComponent(text) : '') : '';
  };
  GX.safeUrl = function (u) {
    u = String(u || '').trim();
    return /^https?:\/\/[^\s<>"'`]+$/i.test(u) ? u : '';
  };
  GX.money = function (n) { return Number(n || 0).toLocaleString('en-US') + ' ج.م'; };
  GX.date = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try {
      return d.toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  };

  /* ---------- config (defaults first, saved values when they arrive) ---------- */
  GX.settings = clone(GX.defaults.settings);
  GX.prices = clone(GX.defaults.prices);
  var renderers = [];
  GX.onConfig = function (fn) { renderers.push(fn); try { fn(); } catch (e) { console.error(e); } };

  GX.mergeSettings = function (saved) {
    var out = clone(GX.defaults.settings);
    if (!saved || typeof saved !== 'object') return out;
    Object.keys(out).forEach(function (k) {
      if (k === 'stats') {
        if (Array.isArray(saved.stats) && saved.stats.length) {
          out.stats = saved.stats.slice(0, 4).map(function (s) {
            return { value: String((s && s.value) || ''), label: String((s && s.label) || '') };
          });
        }
      } else if (typeof saved[k] === 'string') out[k] = saved[k];
    });
    return out;
  };
  GX.normalizePrices = function (p) {
    var base = clone(GX.defaults.prices);
    if (!p || !Array.isArray(p.tiers) || !Array.isArray(p.zones)) return base;
    base.tiers = base.tiers.map(function (t) {
      var s = p.tiers.filter(function (x) { return x && x.id === t.id; })[0] || {};
      return { id: t.id, name: String(s.name || t.name), range: String(s.range || t.range) };
    });
    base.zones = base.zones.map(function (z) {
      var s = p.zones.filter(function (x) { return x && x.id === z.id; })[0] || {};
      var prices = {};
      base.tiers.forEach(function (t) {
        var v = s.prices && Number(s.prices[t.id]);
        prices[t.id] = isFinite(v) && v >= 0 ? v : z.prices[t.id];
      });
      return { id: z.id, name: String(s.name || z.name), time: String(s.time || z.time), prices: prices };
    });
    if (Array.isArray(p.notes)) base.notes = p.notes.map(String).filter(Boolean);
    return base;
  };
  function applyConfig(cfg) {
    GX.settings = GX.mergeSettings(cfg && cfg.settings);
    GX.prices = GX.normalizePrices(cfg && cfg.prices);
    renderers.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }
  GX.applyConfig = applyConfig;

  function zoneById(id) { return GX.prices.zones.filter(function (z) { return z.id === id; })[0] || GX.prices.zones[0]; }
  function tierById(id) { return GX.prices.tiers.filter(function (t) { return t.id === id; })[0] || GX.prices.tiers[0]; }
  function minPrice(tierId) {
    var vals = GX.prices.zones.map(function (z) { return Number(z.prices[tierId]); }).filter(isFinite);
    return vals.length ? Math.min.apply(null, vals) : 0;
  }
  function zoneFrom(zone) {
    var vals = GX.prices.tiers.map(function (t) { return Number(zone.prices[t.id]); }).filter(isFinite);
    return vals.length ? Math.min.apply(null, vals) : 0;
  }
  var SHADES = { z1: '#f2f3f5', z2: 'transparent', z3: '#d3d7dd', z4: '#a9aeb6', z5: '#7e848d', z6: '#5b6069', z7: '#3a3e45' };
  GX.zoneById = zoneById;
  GX.tierById = tierById;

  /* ---------- settings → page ---------- */
  function renderSettings() {
    var s = GX.settings;
    $$('[data-gx-text]').forEach(function (n) { n.textContent = s[n.getAttribute('data-gx-text')] || ''; });
    $$('[data-gx-link]').forEach(function (a) {
      var k = a.getAttribute('data-gx-link');
      var href = '';
      if (k === 'tel') href = GX.tel(s.phone);
      else if (k === 'whatsapp') href = GX.wa(a.getAttribute('data-wa-text') || 'أهلاً جوست إكسبريس، عندي استفسار:');
      else if (k === 'email') href = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.email || '') ? 'mailto:' + s.email : '';
      else href = GX.safeUrl(s[k]);
      if (href) a.setAttribute('href', href); else a.removeAttribute('href');
      if (a.hasAttribute('data-gx-optional')) a.hidden = !href;
    });
    $$('[data-gx-row]').forEach(function (n) { n.hidden = !s[n.getAttribute('data-gx-row')]; });
    $$('[data-gx-stats]').forEach(function (box) {
      box.textContent = '';
      s.stats.forEach(function (st) {
        if (!st.value && !st.label) return;
        box.append(el('div', null, [el('b', { text: st.value }), el('span', { text: st.label })]));
      });
    });
    $$('[data-gx-store]').forEach(function (a) {
      var url = GX.safeUrl(s[a.getAttribute('data-gx-store')]);
      a.classList.toggle('is-soon', !url);
      if (url) { a.setAttribute('href', url); a.removeAttribute('aria-disabled'); }
      else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
      var small = $('small', a);
      if (small) small.textContent = url ? small.getAttribute('data-on') : 'قريباً على';
    });
    $$('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });
  }

  /* ---------- prices → page ---------- */
  function priceCell(value, tag, cls) {
    return el(tag || 'td', { class: cls || 'price' }, [String(Number(value || 0).toLocaleString('en-US')), el('small', { text: 'ج.م' })]);
  }
  function renderPriceTabs(box) {
    var cur = box.getAttribute('data-tier');
    if (!GX.prices.tiers.some(function (t) { return t.id === cur; })) cur = GX.prices.tiers[0].id;
    var panelId = (box.id || 'gx-prices') + '-panel';
    box.textContent = '';
    var tabs = el('div', { class: 'tiers', role: 'tablist', 'aria-label': 'باقات الأسعار حسب عدد الشحنات' });
    GX.prices.tiers.forEach(function (t, i) {
      var on = t.id === cur;
      var b = el('button', { type: 'button', class: 'tier', role: 'tab', id: panelId + '-t' + i, 'aria-selected': on ? 'true' : 'false', 'aria-controls': panelId, tabindex: on ? '0' : '-1' }, [
        el('b', { text: t.name }),
        el('span', { text: t.range }),
        el('em', { text: 'من ' + GX.money(minPrice(t.id)) })
      ]);
      b.addEventListener('click', function () { box.setAttribute('data-tier', t.id); renderPriceTabs(box); var nb = $('#' + panelId + '-t' + i); if (nb) nb.focus(); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (i + d + GX.prices.tiers.length) % GX.prices.tiers.length;
        box.setAttribute('data-tier', GX.prices.tiers[n].id);
        renderPriceTabs(box);
        var nb = $('#' + panelId + '-t' + n);
        if (nb) nb.focus();
      });
      tabs.append(b);
    });
    var tier = tierById(cur);
    var tbody = el('tbody');
    GX.prices.zones.forEach(function (z) {
      tbody.append(el('tr', null, [
        el('th', { scope: 'row' }, [el('i', { class: 'zone-swatch', style: 'background:' + SHADES[z.id] + (z.id === 'z2' ? ';border-style:dashed' : '') }), z.name]),
        el('td', { class: 'time', text: z.time }),
        priceCell(z.prices[tier.id])
      ]));
    });
    var table = el('table', { class: 'price-table' }, [
      el('caption', { class: 'sr-only', text: 'أسعار باقة ' + tier.name + ' (' + tier.range + ')' }),
      el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: 'المنطقة' }), el('th', { scope: 'col', text: 'مدة التوصيل' }), el('th', { scope: 'col', text: 'سعر الشحنة' })])]),
      tbody
    ]);
    box.append(tabs, el('div', { class: 'price-card', id: panelId, role: 'tabpanel', 'aria-labelledby': panelId + '-t' + GX.prices.tiers.indexOf(tier) }, [table]));
  }
  function renderMatrix(box) {
    box.textContent = '';
    var head = el('tr', null, [el('th', { scope: 'col', text: 'المنطقة' }), el('th', { scope: 'col', text: 'مدة التوصيل' })]);
    GX.prices.tiers.forEach(function (t) {
      head.append(el('th', { scope: 'col', 'data-col': t.id }, [el('b', { text: t.name }), t.range]));
    });
    var tbody = el('tbody');
    GX.prices.zones.forEach(function (z) {
      var tr = el('tr', null, [
        el('th', { scope: 'row' }, [el('i', { class: 'zone-swatch', style: 'background:' + SHADES[z.id] + (z.id === 'z2' ? ';border-style:dashed' : '') }), z.name]),
        el('td', { class: 'time', text: z.time })
      ]);
      GX.prices.tiers.forEach(function (t) { var c = priceCell(z.prices[t.id]); c.setAttribute('data-col', t.id); tr.append(c); });
      tbody.append(tr);
    });
    box.append(el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'جدول الأسعار' }, [
      el('table', { class: 'price-table matrix' }, [el('caption', { class: 'sr-only', text: 'سعر الشحنة بالجنيه حسب المنطقة والباقة' }), el('thead', null, [head]), tbody])
    ]));
  }
  function renderNotes(ul) {
    ul.textContent = '';
    GX.prices.notes.forEach(function (n) { ul.append(el('li', { text: n })); });
  }
  function renderZoneLegend(ul) {
    ul.textContent = '';
    GX.prices.zones.forEach(function (z) {
      ul.append(el('li', null, [
        el('i', { class: z.id === 'z2' ? 'dashed' : null, style: 'background:' + SHADES[z.id] }),
        el('span', { text: z.name }),
        el('span', { class: 't', text: z.time })
      ]));
    });
  }
  function renderZoneTable(box) {
    box.textContent = '';
    var tbody = el('tbody');
    GX.prices.zones.forEach(function (z) {
      var govs = GX.governorates.filter(function (g) { return g.zone === z.id; });
      var names = z.id === 'z2'
        ? 'أكتوبر، الشيخ زايد، التجمع، الشروق، العبور، بدر، العاشر من رمضان'
        : govs.map(function (g) { return g.name; }).join('، ');
      tbody.append(el('tr', null, [
        el('th', { scope: 'row' }, [el('i', { class: 'zone-swatch', style: 'background:' + SHADES[z.id] + (z.id === 'z2' ? ';border-style:dashed' : '') }), z.name]),
        el('td', { class: 'time', style: 'white-space:normal', text: names }),
        el('td', { class: 'time', text: z.time })
      ]));
    });
    box.append(el('div', { class: 'price-card' }, [el('div', { class: 'table-scroll' }, [el('table', { class: 'price-table', style: 'min-width:560px' }, [
      el('thead', null, [el('tr', null, [el('th', { scope: 'col', text: 'المنطقة' }), el('th', { scope: 'col', text: 'المحافظات' }), el('th', { scope: 'col', text: 'مدة التوصيل' })])]),
      tbody
    ])])]));
  }
  function fillSelect(sel, items, placeholder) {
    var keep = sel.value;
    sel.textContent = '';
    if (placeholder) sel.append(el('option', { value: '', text: placeholder }));
    items.forEach(function (it) {
      if (it.group) {
        var g = el('optgroup', { label: it.group });
        it.items.forEach(function (o) { g.append(el('option', { value: o.value, text: o.text })); });
        sel.append(g);
      } else sel.append(el('option', { value: it.value, text: it.text }));
    });
    if (keep && $$('option', sel).some(function (o) { return o.value === keep; })) sel.value = keep;
  }
  function govGroups() {
    return GX.prices.zones.map(function (z) {
      return {
        group: z.name,
        items: GX.governorates.filter(function (g) { return g.zone === z.id; }).map(function (g) { return { value: g.id, text: g.name }; })
      };
    }).filter(function (g) { return g.items.length; });
  }
  function renderSelects() {
    $$('[data-gx-gov-options]').forEach(function (s) { fillSelect(s, govGroups(), s.getAttribute('data-placeholder')); });
    $$('[data-gx-tier-options]').forEach(function (s) {
      fillSelect(s, GX.prices.tiers.map(function (t) { return { value: t.id, text: t.name + ' (' + t.range + ')' }; }), s.getAttribute('data-placeholder'));
    });
    $$('[data-gx-msg-types]').forEach(function (s) { fillSelect(s, GX.messageTypes.map(function (t) { return { value: t.id, text: t.name }; })); });
    $$('[data-gx-biz-types]').forEach(function (s) { fillSelect(s, GX.businessTypes.map(function (t) { return { value: t, text: t }; }), s.getAttribute('data-placeholder')); });
  }
  function renderPrices() {
    $$('[data-gx-price-tabs]').forEach(renderPriceTabs);
    $$('[data-gx-price-matrix]').forEach(renderMatrix);
    $$('[data-gx-notes]').forEach(renderNotes);
    $$('[data-gx-zone-legend]').forEach(renderZoneLegend);
    $$('[data-gx-zone-table]').forEach(renderZoneTable);
    renderSelects();
  }

  /* ---------- price calculator ---------- */
  function initCalc() {
    var gov = $('#calc-gov'), tier = $('#calc-tier');
    if (!gov || !tier) return;
    function update() {
      var g = GX.governorates.filter(function (x) { return x.id === gov.value; })[0] || GX.governorates[0];
      var z = zoneById(g.zone), t = tierById(tier.value);
      $('#calc-price').textContent = Number(z.prices[t.id] || 0).toLocaleString('en-US');
      $('#calc-zone').textContent = z.name;
      $('#calc-time').textContent = z.time;
      $('#calc-tiername').textContent = t.name + ' — ' + t.range;
      $$('[data-gx-price-matrix] [data-col]').forEach(function (c) { c.classList.toggle('is-picked', c.getAttribute('data-col') === t.id); });
    }
    gov.addEventListener('change', update);
    tier.addEventListener('change', update);
    GX.onConfig(update);
  }

  /* ---------- Egypt coverage map ---------- */
  function buildMap(box) {
    var M = window.GX_MAP;
    if (!M) return;
    var byId = {};
    GX.governorates.forEach(function (g) { byId[g.id] = g; });
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-8 -8 ' + (M.w + 16) + ' ' + (M.h + 16));
    svg.setAttribute('class', 'egmap');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'خريطة مصر بمناطق التوصيل: الأفتح بيوصل أسرع');
    function mk(tag, attrs) {
      var n = doc.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      svg.appendChild(n);
      return n;
    }
    M.govs.forEach(function (g) {
      var info = byId[g.id];
      mk('path', { d: g.d, class: 'gov ' + (info ? info.zone : ''), 'data-id': g.id });
    });
    if (M.lakes) mk('path', { d: M.lakes, class: 'lake' });
    if (M.nile) mk('path', { d: M.nile, class: 'nile' });
    var labels = { 'القاهرة': [0, -12], 'الإسكندرية': [-8, -12], 'أسوان': [26, 4], 'الغردقة': [28, 4], 'مرسى مطروح': [6, 16], 'العريش': [-4, -10] };
    M.cities.forEach(function (c) {
      if (c.n === 'القاهرة') {
        mk('circle', { cx: c.x, cy: c.y, r: 5, class: 'pulse' });
        mk('circle', { cx: c.x, cy: c.y, r: 4.6, class: 'hq' });
      } else mk('circle', { cx: c.x, cy: c.y, r: 2.8, class: 'city' });
    });
    M.cities.forEach(function (c) {
      var off = labels[c.n];
      if (!off) return;
      var t = mk('text', { x: c.x + off[0], y: c.y + off[1], class: 'lbl', 'text-anchor': 'middle' });
      t.textContent = c.n;
    });
    var tip = el('div', { class: 'map-tip', hidden: true, 'aria-hidden': 'true' });
    box.textContent = '';
    box.append(svg, tip, el('p', { class: 'map-note', text: 'عدّي على أي محافظة تعرف مدة التوصيل وسعرها. المدن الجديدة ليها سعر منطقة الأطراف.' }));
    var active = null;
    function show(path, x, y) {
      var g = byId[path.getAttribute('data-id')];
      if (!g) return;
      var z = zoneById(g.zone);
      tip.textContent = '';
      tip.append(el('b', { text: g.name }), el('span', { text: z.name }), el('div', { text: 'التوصيل خلال ' + z.time }), el('div', { text: 'السعر يبدأ من ' + GX.money(zoneFrom(z)) }));
      tip.hidden = false;
      var r = box.getBoundingClientRect();
      var tw = tip.offsetWidth || 200;
      var left = Math.max(tw / 2 + 4, Math.min(r.width - tw / 2 - 4, x - r.left));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(tip.offsetHeight + 18, y - r.top) + 'px';
      if (active && active !== path) active.classList.remove('is-on');
      active = path;
      path.classList.add('is-on');
    }
    function hide() { tip.hidden = true; if (active) active.classList.remove('is-on'); active = null; }
    svg.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var p = e.target.closest ? e.target.closest('.gov') : null;
      if (p) show(p, e.clientX, e.clientY); else hide();
    });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hide(); });
    svg.addEventListener('click', function (e) {
      var p = e.target.closest ? e.target.closest('.gov') : null;
      if (p) { if (p === active && !tip.hidden) hide(); else show(p, e.clientX, e.clientY); } else hide();
    });
    doc.addEventListener('click', function (e) { if (!box.contains(e.target)) hide(); });
  }

  /* ---------- Cairo-at-night skyline (hero) ---------- */
  function initSkyline(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
    function draw() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var r = rng(20261016);
      var glow = ctx.createLinearGradient(0, 0, 0, h);
      glow.addColorStop(0, 'rgba(170,180,195,0)');
      glow.addColorStop(1, 'rgba(170,180,195,0.10)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      // Giza pyramids, far west
      ctx.fillStyle = '#121419';
      [[0.05, 0.46], [0.115, 0.6], [0.18, 0.32]].forEach(function (p) {
        var cx = w * p[0], ph = h * p[1];
        ctx.beginPath(); ctx.moveTo(cx - ph * 1.1, h); ctx.lineTo(cx, h - ph); ctx.lineTo(cx + ph * 1.1, h); ctx.closePath(); ctx.fill();
      });
      // mid-rise city
      var x = w * 0.2;
      ctx.fillStyle = '#15171c';
      while (x < w) {
        var bw = 16 + r() * 44, bh = h * (0.16 + r() * 0.36);
        ctx.fillRect(x, h - bh, bw - 2, bh);
        x += bw;
      }
      // Cairo Tower
      (function (cx) {
        var H = h * 0.97, top = h - H;
        ctx.fillStyle = '#1c1e24';
        ctx.beginPath(); ctx.moveTo(cx - 9, h); ctx.lineTo(cx - 4.5, top + H * 0.3); ctx.lineTo(cx + 4.5, top + H * 0.3); ctx.lineTo(cx + 9, h); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 4.5, top + H * 0.3); ctx.lineTo(cx - 12, top + H * 0.13); ctx.lineTo(cx + 12, top + H * 0.13); ctx.lineTo(cx + 4.5, top + H * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillRect(cx - 13.5, top + H * 0.1, 27, H * 0.035);
        ctx.fillRect(cx - 1, top, 2, H * 0.1);
        ctx.fillStyle = 'rgba(240,244,250,0.75)';
        ctx.fillRect(cx - 10, top + H * 0.115, 20, 1.6);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, top + 1, 1.6, 0, Math.PI * 2); ctx.fill();
      })(w * 0.6);
      // Citadel mosque, east
      (function (cx) {
        var base = h, bh = h * 0.24, dome = h * 0.22;
        ctx.fillStyle = '#1a1c22';
        ctx.fillRect(cx - 58, base - bh, 116, bh);
        ctx.beginPath(); ctx.ellipse(cx, base - bh, 32, dome, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(cx - 1.5, base - bh - dome - 9, 3, 10);
        [-40, 40].forEach(function (d) { ctx.beginPath(); ctx.ellipse(cx + d, base - bh, 13, h * 0.09, 0, Math.PI, 0); ctx.fill(); });
        [-70, 70].forEach(function (d) {
          var mh = h * 0.86, mx = cx + d;
          ctx.fillRect(mx - 3, base - mh, 6, mh);
          ctx.beginPath(); ctx.moveTo(mx - 3.4, base - mh); ctx.lineTo(mx, base - mh - 15); ctx.lineTo(mx + 3.4, base - mh); ctx.closePath(); ctx.fill();
          ctx.fillRect(mx - 5, base - mh * 0.62, 10, 2.4);
          ctx.fillRect(mx - 5, base - mh * 0.86, 10, 2.4);
        });
      })(w * 0.86);
      // near blocks with lit windows
      x = -6;
      while (x < w) {
        var nw = 24 + r() * 58, nh = h * (0.08 + r() * 0.26);
        ctx.fillStyle = '#1f2127';
        ctx.fillRect(x, h - nh, nw - 3, nh);
        for (var wy = h - nh + 7; wy < h - 5; wy += 9) {
          for (var wx = x + 5; wx < x + nw - 8; wx += 8) {
            if (r() < 0.2) { ctx.fillStyle = 'rgba(236,241,248,' + (0.12 + r() * 0.55).toFixed(2) + ')'; ctx.fillRect(wx, wy, 3, 4); }
          }
        }
        x += nw;
      }
    }
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(canvas);
    else window.addEventListener('resize', draw);
  }

  /* ---------- header, menus, helper ---------- */
  function setActiveNav(name) {
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function initHeader() {
    var drop = $('[data-drop]');
    if (drop) {
      var btn = $('button', drop), menu = $('.drop', drop);
      var set = function (open) { drop.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open; };
      btn.addEventListener('click', function (e) { e.stopPropagation(); set(menu.hidden); });
      doc.addEventListener('click', function (e) { if (!drop.contains(e.target)) set(false); });
      doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    }
    var mb = $('.menu-btn'), mn = $('#mnav');
    if (mb && mn) {
      var setM = function (open) {
        mn.hidden = !open;
        mb.setAttribute('aria-expanded', String(open));
        $('use', mb).setAttribute('href', open ? '#i-close' : '#i-menu');
      };
      mb.addEventListener('click', function () { setM(mn.hidden); });
      mn.addEventListener('click', function (e) { if (e.target.closest('a')) setM(false); });
      window.addEventListener('resize', function () { if (window.innerWidth > 1080) setM(false); });
    }
  }
  function initHelper() {
    var h = $('[data-helper]');
    if (!h) return;
    var b = $('.helper-btn', h), p = $('.helper-panel', h);
    var set = function (open) {
      p.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      $('img', b).hidden = open;
      $('.ic', b).hidden = !open;
    };
    b.addEventListener('click', function () { set(p.hidden); });
    p.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    doc.addEventListener('click', function (e) { if (!h.contains(e.target)) set(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !p.hidden) { set(false); b.focus(); } });
  }

  /* ---------- toast & copy ---------- */
  GX.toast = function (msg, ic) {
    var t = $('#gx-toast');
    if (!t) { t = el('div', { id: 'gx-toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); doc.body.append(t); }
    t.textContent = '';
    t.append(icon(ic || 'check'), el('span', { text: msg }));
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, 3400);
  };
  GX.copy = function (text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { GX.toast('اتنسخ: ' + text); }, function () { GX.toast('انسخه يدوي: ' + text, 'info'); });
      }
    } catch (e) {}
    GX.toast('انسخه يدوي: ' + text, 'info');
    return Promise.resolve();
  };
  doc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy],[data-copy-setting]');
    if (!b) return;
    var text = b.getAttribute('data-copy') || GX.settings[b.getAttribute('data-copy-setting')] || '';
    if (text) GX.copy(text);
  });

  /* ---------- prefill between pages (e.g. "request integration" → contact form) ---------- */
  GX.setPrefill = function (o) { GX._prefill = o; GX.kv.set('gx.prefill', o, true); };
  GX.takePrefill = function () {
    var p = GX._prefill || GX.kv.get('gx.prefill', null, true);
    GX._prefill = null;
    GX.kv.del('gx.prefill', true);
    return p;
  };
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('[data-prefill]');
    if (!a) return;
    try { GX.setPrefill(JSON.parse(a.getAttribute('data-prefill'))); } catch (x) {}
  }, true);

  /* ---------- forms ---------- */
  function fieldError(input, msg) {
    var err = doc.getElementById(input.id + '-err');
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) { err.textContent = msg || ''; if (msg) input.setAttribute('aria-describedby', err.id); }
  }
  function validate(form, rules) {
    var first = null;
    rules.forEach(function (rule) {
      var inp = $('#' + rule.id, form);
      if (!inp || inp.closest('[hidden]')) return;
      var v = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
      var msg = rule.check(v, inp) || '';
      fieldError(inp, msg);
      if (msg && !first) first = inp;
    });
    if (first) first.focus();
    return !first;
  }
  function liveClear(form) {
    form.addEventListener('input', function (e) { if (e.target.getAttribute('aria-invalid') === 'true') fieldError(e.target, ''); });
    form.addEventListener('change', function (e) { if (e.target.getAttribute('aria-invalid') === 'true') fieldError(e.target, ''); });
  }
  var need = function (msg) { return function (v) { return v ? '' : msg; }; };
  var mobile = function (v) { return !v ? 'اكتب رقم الموبايل.' : (GX.validMobile(v) ? '' : 'اكتب رقم موبايل مصري صحيح من 11 رقم، زي 01012345678.'); };
  function busy(btn, on, label) {
    if (on) { btn._label = btn.textContent; btn.textContent = label || 'بنبعت…'; btn.disabled = true; }
    else { btn.textContent = btn._label || btn.textContent; btn.disabled = false; }
  }
  function doneNote(r) {
    return r && r.fallback ? 'الطلب اتسجل في المعاينة على الجهاز ده بس. عشان يوصلنا أكيد ابعته على واتساب.' : '';
  }

  function initRegister() {
    var f = $('#reg-form');
    if (!f) return;
    liveClear(f);
    var same = $('#reg-wa-same'), waField = $('#reg-wa-field');
    var syncWa = function () { waField.hidden = same.checked; };
    same.addEventListener('change', syncWa);
    syncWa();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('#reg-status');
      status.textContent = '';
      if (f.querySelector('[name="website"]').value) return;
      var ok = validate(f, [
        { id: 'reg-name', check: need('اكتب اسمك.') },
        { id: 'reg-phone', check: mobile },
        { id: 'reg-wa', check: function (v) { return v && !GX.validMobile(v) ? 'اكتب رقم واتساب صحيح من 11 رقم.' : (!v ? 'اكتب رقم الواتساب أو علّم إنه نفس رقم الموبايل.' : ''); } },
        { id: 'reg-email', check: function (v) { return v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'اكتب إيميل صحيح أو سيبه فاضي.' : ''; } },
        { id: 'reg-store', check: need('اكتب اسم المتجر أو الصفحة.') },
        { id: 'reg-volume', check: need('اختار عدد شحناتك في الشهر.') },
        { id: 'reg-category', check: need('اختار نوع نشاطك.') },
        { id: 'reg-gov', check: need('اختار المحافظة اللي هنستلم منها.') },
        { id: 'reg-area', check: need('اكتب المنطقة.') },
        { id: 'reg-terms', check: function (v) { return v ? '' : 'لازم توافق على الشروط والأحكام عشان نفتحلك الحساب.'; } }
      ]);
      if (!ok) return;
      var phone = GX.normPhone($('#reg-phone').value);
      var tier = tierById($('#reg-volume').value);
      var gov = GX.governorates.filter(function (g) { return g.id === $('#reg-gov').value; })[0];
      var data = {
        name: $('#reg-name').value.trim(),
        phone: phone,
        whatsapp: same.checked ? phone : GX.normPhone($('#reg-wa').value),
        email: $('#reg-email').value.trim(),
        store: $('#reg-store').value.trim(),
        page: $('#reg-page').value.trim(),
        volume: tier.name + ' (' + tier.range + ')',
        category: $('#reg-category').value,
        governorate: gov ? gov.name : '',
        area: $('#reg-area').value.trim(),
        address: $('#reg-address').value.trim(),
        notes: $('#reg-notes').value.trim()
      };
      var btn = $('button[type="submit"]', f);
      busy(btn, true);
      GX.store.submit('registrations', data).then(function (r) {
        f.hidden = true;
        var done = $('#reg-done');
        $('#reg-done-name').textContent = data.name.split(' ')[0];
        $('#reg-done-note').textContent = doneNote(r);
        $('#reg-done-wa').setAttribute('href', GX.wa(
          'أهلاً جوست إكسبريس، سجلت طلب فتح حساب تاجر:\n' +
          'الاسم: ' + data.name + '\nالمتجر: ' + data.store + '\nالموبايل: ' + data.phone +
          '\nالمحافظة: ' + data.governorate + ' — ' + data.area + '\nعدد الشحنات: ' + data.volume
        ));
        done.hidden = false;
        done.focus();
      }).catch(function (err) {
        status.textContent = (err && err.message) || 'معرفناش نبعت الطلب. جرب تاني أو كلمنا على واتساب.';
      }).then(function () { busy(btn, false); });
    });
  }

  function initContact() {
    var f = $('#ct-form');
    if (!f) return;
    liveClear(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('#ct-status');
      status.textContent = '';
      if (f.querySelector('[name="website"]').value) return;
      var ok = validate(f, [
        { id: 'ct-name', check: need('اكتب اسمك.') },
        { id: 'ct-phone', check: mobile },
        { id: 'ct-message', check: function (v) { return v.length < 5 ? 'اكتب رسالتك (5 حروف على الأقل).' : ''; } }
      ]);
      if (!ok) return;
      var type = GX.messageTypes.filter(function (t) { return t.id === $('#ct-type').value; })[0] || GX.messageTypes[0];
      var data = { name: $('#ct-name').value.trim(), phone: GX.normPhone($('#ct-phone').value), type: type.name, message: $('#ct-message').value.trim() };
      var btn = $('button[type="submit"]', f);
      busy(btn, true);
      GX.store.submit('messages', data).then(function (r) {
        f.hidden = true;
        var done = $('#ct-done');
        $('#ct-done-name').textContent = data.name.split(' ')[0];
        $('#ct-done-note').textContent = doneNote(r);
        $('#ct-done-wa').setAttribute('href', GX.wa('أهلاً جوست إكسبريس، أنا ' + data.name + ' (' + data.phone + ')\n' + type.name + ':\n' + data.message));
        done.hidden = false;
        done.focus();
      }).catch(function (err) {
        status.textContent = (err && err.message) || 'معرفناش نبعت الرسالة. جرب تاني أو كلمنا على واتساب.';
      }).then(function () { busy(btn, false); });
    });
    $('#ct-again').addEventListener('click', function () {
      f.reset();
      f.hidden = false;
      $('#ct-done').hidden = true;
      $('#ct-name').focus();
    });
  }

  function applyContactPrefill() {
    var p = GX.takePrefill();
    if (!p) return;
    var type = $('#ct-type'), msg = $('#ct-message');
    if (p.type && type && $$('option', type).some(function (o) { return o.value === p.type; })) type.value = p.type;
    if (p.message && msg && !msg.value) msg.value = p.message;
  }

  /* ---------- tracking ---------- */
  function initTrack() {
    var f = $('#trk-form');
    if (!f) return;
    var inp = $('#trk-code'), out = $('#trk-result'), errEl = $('#trk-code-err');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = GX.digits(inp.value).trim().toUpperCase().replace(/\s+/g, '');
      if (code.length < 4) {
        inp.setAttribute('aria-invalid', 'true');
        errEl.textContent = 'اكتب رقم الشحنة زي ما هو مكتوب على البوليصة، مثلاً GX-2610-48217.';
        inp.focus();
        return;
      }
      inp.setAttribute('aria-invalid', 'false');
      errEl.textContent = '';
      out.textContent = '';
      var tpl = GX.safeUrl(GX.settings.trackUrl);
      out.append(el('h2', null, ['الشحنة ', el('span', { class: 'ltr', text: code })]));
      if (tpl) {
        var url = tpl.indexOf('{code}') > -1 ? tpl.split('{code}').join(encodeURIComponent(code)) : tpl;
        out.append(
          el('p', { text: 'حالة شحنتك بالتفصيل موجودة على صفحة التتبع في السيستم بتاعنا. افتحها من هنا:' }),
          el('div', { class: 'btn-row' }, [el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, [icon('external'), 'افتح صفحة التتبع'])])
        );
      } else {
        out.append(
          el('p', { text: 'ابعت رقم الشحنة لفريق خدمة العملاء على واتساب، وهنرد عليك بحالتها ومكانها بالظبط.' }),
          el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn btn--wa', href: GX.wa('أهلاً جوست إكسبريس، عايز أعرف حالة الشحنة رقم: ' + code), target: '_blank', rel: 'noopener' }, [icon('chat'), 'ابعت الرقم على واتساب']),
            el('button', { class: 'btn btn--line', type: 'button', 'data-copy-setting': 'phone' }, [icon('phone'), el('span', { class: 'ltr', text: GX.settings.phone })])
          ])
        );
      }
      out.hidden = false;
    });
    inp.addEventListener('input', function () { if (inp.getAttribute('aria-invalid') === 'true') { inp.setAttribute('aria-invalid', 'false'); errEl.textContent = ''; } });
  }

  /* ---------- pages & routing ---------- */
  var hooks = {};
  GX.onPageShow = function (name, fn) { (hooks[name] = hooks[name] || []).push(fn); };
  var pages = $$('main[data-page]');
  GX.SPA = pages.length > 1;

  function showPage(name, sectionId) {
    var target = null;
    pages.forEach(function (p) { var on = p.getAttribute('data-page') === name; p.hidden = !on; if (on) target = p; });
    if (!target) return false;
    doc.body.setAttribute('data-active', name);
    doc.body.classList.toggle('layout-bare', target.getAttribute('data-layout') === 'bare');
    var t = target.getAttribute('data-title');
    if (t) doc.title = t;
    setActiveNav(name);
    (hooks[name] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    var sec = sectionId && doc.getElementById(sectionId);
    if (sec) sec.scrollIntoView(); else window.scrollTo(0, 0);
    requestAnimationFrame(function () { if (sec) sec.scrollIntoView(); else window.scrollTo(0, 0); });
    return true;
  }
  function route() {
    var raw = '';
    try { raw = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    if (!raw) return showPage('home');
    var dot = raw.indexOf('.');
    var name = dot > -1 ? raw.slice(0, dot) : raw;
    var sec = dot > -1 ? raw.slice(dot + 1) : '';
    if ($('main[data-page="' + name + '"]')) return showPage(name, sec);
    var target = doc.getElementById(raw);
    if (target) {
      var host = target.closest('main[data-page]');
      if (host && host.hidden) showPage(host.getAttribute('data-page'), raw);
      else target.scrollIntoView();
      return true;
    }
    return showPage('home');
  }

  /* ---------- boot ---------- */
  GX.onConfig(renderSettings);
  GX.onConfig(renderPrices);
  initCalc();
  $$('[data-gx-map]').forEach(buildMap);
  $$('[data-gx-skyline]').forEach(initSkyline);
  initHeader();
  initHelper();
  initRegister();
  initContact();
  initTrack();
  GX.onPageShow('contact', applyContactPrefill);
  GX.onPageShow('admin', function () { if (GX.admin && !GX.admin.mounted) GX.admin.mount(); });

  if (GX.SPA) {
    window.addEventListener('hashchange', route);
    route();
  } else {
    var only = pages[0] ? pages[0].getAttribute('data-page') : 'home';
    if (pages[0] && pages[0].getAttribute('data-layout') === 'bare') doc.body.classList.add('layout-bare');
    setActiveNav(only);
    (hooks[only] || []).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  GX.store.ready
    .then(function () { return GX.store.loadConfig(); })
    .then(applyConfig)
    .catch(function (e) { console.warn('Ghost Express: using default content', e); });
})();
