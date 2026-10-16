/* Ghost Express — data layer.
   On hosting with PHP the site talks to api.php (requests, messages, prices,
   settings are saved on the server). Without PHP it falls back to a demo
   mode that keeps data in this browser only. */
(function () {
  var GX = (window.GX = window.GX || {});
  var mem = {};

  /* ---------- small safe storage helpers (storage can throw) ---------- */
  function area(session) {
    try { return session ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }
  GX.kv = {
    get: function (key, fallback, session) {
      var s = area(session);
      try {
        if (s) { var v = s.getItem(key); if (v != null) return JSON.parse(v); }
      } catch (e) {}
      var mk = (session ? 's:' : 'l:') + key;
      return Object.prototype.hasOwnProperty.call(mem, mk) ? JSON.parse(mem[mk]) : fallback;
    },
    set: function (key, value, session) {
      var raw = JSON.stringify(value);
      mem[(session ? 's:' : 'l:') + key] = raw;
      var s = area(session);
      try { if (s) { s.setItem(key, raw); return true; } } catch (e) {}
      return false;
    },
    del: function (key, session) {
      delete mem[(session ? 's:' : 'l:') + key];
      var s = area(session);
      try { if (s) s.removeItem(key); } catch (e) {}
    }
  };

  GX.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  GX.hash = function (text) {
    var str = 'gx:' + String(text);
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return Promise.resolve('f' + h.toString(16));
  };

  function err(code, message) { return { code: code, message: message }; }
  GX.DEMO_PASSWORD = 'ghost2026';

  /* ---------- PHP adapter (real hosting) ---------- */
  var php = {
    name: 'php',
    csrf: null,
    call: function (action, body, query) {
      var opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
      if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      if (php.csrf) opts.headers['X-CSRF-Token'] = php.csrf;
      var url = 'api.php?action=' + encodeURIComponent(action) + (query ? '&' + query : '');
      return fetch(url, opts).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!data) throw err('bad_response', 'السيرفر رجع رد مش مفهوم. اتأكد إن الاستضافة بتشغل PHP.');
          if (!res.ok || !data.ok) throw err(data.code || 'error', data.error || 'حصلت مشكلة، جرب تاني.');
          return data;
        });
      });
    },
    probe: function () {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
      return fetch('api.php?action=config', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { clearTimeout(timer); if (d && d.ok) { php._config = d; return true; } return false; })
        .catch(function () { clearTimeout(timer); return false; });
    },
    loadConfig: function () {
      if (php._config) { var c = php._config; php._config = null; return Promise.resolve({ settings: c.settings, prices: c.prices }); }
      return php.call('config').then(function (d) { return { settings: d.settings, prices: d.prices }; });
    },
    submit: function (kind, data) { return php.call('submit', { kind: kind, data: data, website: '' }); },
    login: function (password) { return php.call('login', { password: password }).then(function (d) { php.csrf = d.csrf; return true; }); },
    session: function () {
      return php.call('me').then(function (d) { php.csrf = d.csrf || null; return !!d.admin; }).catch(function () { return false; });
    },
    logout: function () { return php.call('logout', {}).catch(function () {}).then(function () { php.csrf = null; }); },
    list: function (kind) { return php.call('list', null, 'kind=' + encodeURIComponent(kind)).then(function (d) { return d.items || []; }); },
    update: function (kind, id, patch) { return php.call('update', { kind: kind, id: id, patch: patch }); },
    remove: function (kind, id) { return php.call('delete', { kind: kind, id: id }); },
    saveSettings: function (s) { return php.call('save_settings', { settings: s }); },
    savePrices: function (p) { return php.call('save_prices', { prices: p }); },
    changePassword: function (current, next) { return php.call('password', { current: current, next: next }); }
  };

  /* ---------- Demo adapter (this browser only) ---------- */
  var local = {
    name: 'local',
    probe: function () { return Promise.resolve(true); },
    loadConfig: function () {
      return Promise.resolve({ settings: GX.kv.get('gx.settings', null), prices: GX.kv.get('gx.prices', null) });
    },
    submit: function (kind, data) {
      var key = 'gx.' + kind;
      var items = GX.kv.get(key, []);
      var item = Object.assign({ id: GX.uid(), createdAt: new Date().toISOString(), status: 'new' }, data);
      items.unshift(item);
      GX.kv.set(key, items.slice(0, 500));
      return Promise.resolve({ ok: true, id: item.id });
    },
    login: function (password) {
      var saved = GX.kv.get('gx.pass', null);
      return GX.hash(password).then(function (h) {
        var ok = saved ? h === saved : password === GX.DEMO_PASSWORD;
        if (!ok) throw err('bad_password', 'كلمة المرور مش صحيحة.');
        GX.kv.set('gx.admin', true, true);
        return true;
      });
    },
    session: function () { return Promise.resolve(!!GX.kv.get('gx.admin', false, true)); },
    logout: function () { GX.kv.del('gx.admin', true); return Promise.resolve(); },
    list: function (kind) { return Promise.resolve(GX.kv.get('gx.' + kind, [])); },
    update: function (kind, id, patch) {
      var items = GX.kv.get('gx.' + kind, []);
      items.forEach(function (it) { if (it.id === id) Object.assign(it, patch, { updatedAt: new Date().toISOString() }); });
      GX.kv.set('gx.' + kind, items);
      return Promise.resolve({ ok: true });
    },
    remove: function (kind, id) {
      GX.kv.set('gx.' + kind, GX.kv.get('gx.' + kind, []).filter(function (it) { return it.id !== id; }));
      return Promise.resolve({ ok: true });
    },
    saveSettings: function (s) { GX.kv.set('gx.settings', s); return Promise.resolve({ ok: true }); },
    savePrices: function (p) { GX.kv.set('gx.prices', p); return Promise.resolve({ ok: true }); },
    changePassword: function (current, next) {
      return local.login(current).then(function () { return GX.hash(next); }).then(function (h) {
        GX.kv.set('gx.pass', h);
        return { ok: true };
      });
    }
  };

  /* ---------- pick the adapter ---------- */
  var candidates = [];
  if (GX.cloudAdapter) candidates.push(GX.cloudAdapter);
  if (GX.BUILD !== 'preview') candidates.push(php);
  candidates.push(local);

  var store = (GX.store = { mode: 'local', adapter: local });

  store.ready = (function pick(i) {
    var a = candidates[i];
    return a.probe().then(function (ok) {
      if (ok) { store.adapter = a; store.mode = a.name; return a.name; }
      return pick(i + 1);
    }, function () { return pick(i + 1); });
  })(0);

  function run(method, args) {
    return store.ready.then(function () { return store.adapter[method].apply(store.adapter, args); });
  }
  ['loadConfig', 'login', 'session', 'logout', 'list', 'update', 'remove', 'saveSettings', 'savePrices', 'changePassword'].forEach(function (m) {
    store[m] = function () { return run(m, Array.prototype.slice.call(arguments)); };
  });

  /* Submissions never get lost: if the main store refuses (for example a
     preview viewer without write access), keep a copy in the demo store. */
  store.submit = function (kind, data) {
    return run('submit', [kind, data]).catch(function (e) {
      if (store.mode === 'php') throw e;
      return local.submit(kind, data).then(function (r) { r.fallback = true; return r; });
    });
  };
})();
