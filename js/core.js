/* KATAL Roadshow – shared core: storage, API, offline outbox, helpers */
(function () {
  'use strict';

  var PREFIX = 'katal.';
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
  };

  // Local testing only: ?api=http://localhost:xxxx (accepted for localhost only)
  (function () {
    try {
      var p = new URLSearchParams(location.search).get('api');
      if (p && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(p + '/')) LS.set('apiOverride', p);
    } catch (e) { /* ignore */ }
  })();

  function apiUrl() {
    var o = LS.get('apiOverride', '');
    if (o && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return o;
    return (window.KATAL_CONFIG && window.KATAL_CONFIG.API_URL) || '';
  }

  function ApiError(message, code) {
    this.message = message;
    this.code = code || 'ERROR';
  }
  ApiError.prototype = Object.create(Error.prototype);

  function api(action, data, opts) {
    opts = opts || {};
    var url = apiUrl();
    if (!url || url.indexOf('PASTE_') === 0) return Promise.reject(new ApiError('The app is not connected to the Google Sheet yet.', 'NO_URL'));
    if (navigator.onLine === false) return Promise.reject(new ApiError('No internet connection', 'NETWORK'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opts.timeout || 25000);
    var body = JSON.stringify(Object.assign({ action: action }, data || {}));
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var json;
        try { json = JSON.parse(txt); } catch (e) { throw new ApiError('Server not reachable (' + res.status + ')', 'NETWORK'); }
        if (!json.ok) throw new ApiError(json.error || 'Something went wrong', json.code || 'ERROR');
        return json;
      });
    }, function () {
      throw new ApiError('No internet connection', 'NETWORK');
    }).finally(function () { clearTimeout(timer); });
  }

  /* ---------------- events ---------------- */
  var listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, arg) { (listeners[evt] || []).forEach(function (fn) { try { fn(arg); } catch (e) { console.error(e); } }); }

  /* ---------------- offline outbox ---------------- */
  // Every write (lead, liked units, note) goes here first, then is sent in order.
  var Outbox = {
    list: function () { return LS.get('outbox', []); },
    save: function (l) { LS.set('outbox', l); emit('outbox', l.length); },
    add: function (action, data, token, agent) {
      var l = this.list();
      l.push({ id: uid('op'), action: action, data: data, token: token, agent: agent, tries: 0, error: '', at: new Date().toISOString() });
      this.save(l);
    },
    remove: function (id) { this.save(this.list().filter(function (o) { return o.id !== id; })); },
    patch: function (id, fields) {
      var l = this.list();
      l.forEach(function (o) { if (o.id === id) Object.assign(o, fields); });
      this.save(l);
    },
    count: function () { return this.list().length; }
  };

  var syncing = false, lastSyncError = '', syncAgain = false;
  function sync() {
    if (syncing) { syncAgain = true; return Promise.resolve(); }
    syncAgain = false;
    var ops = Outbox.list();
    if (!ops.length) { lastSyncError = ''; emit('sync', status()); return Promise.resolve(); }
    syncing = true;
    emit('sync', status());
    var i = 0, stopped = false;
    function next() {
      if (stopped || i >= ops.length) return Promise.resolve();
      var op = ops[i++];
      return api(op.action, Object.assign({ token: op.token }, op.data), { timeout: 30000 }).then(function () {
        Outbox.remove(op.id);
        lastSyncError = '';
        emit('synced', op);
      }, function (err) {
        if (err.code === 'NETWORK' || err.code === 'NO_URL') { stopped = true; lastSyncError = err.message; return; }
        if (err.code === 'AUTH') {
          var s = LS.get('session', null);
          if (s && s.token && s.token !== op.token && sameName(s.agent, op.agent)) {
            Outbox.patch(op.id, { token: s.token });
            ops[--i].token = s.token;
            return;
          }
        }
        lastSyncError = err.message;
        Outbox.patch(op.id, { tries: (op.tries || 0) + 1, error: err.message });
      }).then(next);
    }
    function done() {
      syncing = false;
      emit('sync', status());
      // something was saved while we were sending: send it now (unless we are offline)
      if (syncAgain && !stopped) return sync();
    }
    return next().then(done, done);
  }

  function status() {
    var n = Outbox.count();
    var offline = navigator.onLine === false;
    return { pending: n, syncing: syncing, offline: offline, error: lastSyncError };
  }

  window.addEventListener('online', function () { emit('sync', status()); sync(); });
  window.addEventListener('offline', function () { emit('sync', status()); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  setInterval(function () { if (Outbox.count()) sync(); }, 20000);

  /* ---------------- helpers ---------------- */
  function uid(prefix) {
    var t = Date.now().toString(36).toUpperCase();
    var r = '';
    var a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) r += (a[i] % 36).toString(36);
    return (prefix || 'X') + '-' + t + '-' + r.toUpperCase();
  }
  function sameName(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function fmtNum(n) {
    var x = Number(n);
    if (!isFinite(x)) return '';
    return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var same = d.toDateString() === now.toDateString();
    var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return same ? 'Today ' + t : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + t;
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
  }

  var toastTimer;
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  function confirmSheet(opts) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'sheet-bg';
      bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><h3>' + esc(opts.title) + '</h3>' +
        (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') +
        '<div class="btns"><button class="btn btn-block ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(opts.ok || 'OK') + '</button>' +
        '<button class="btn btn-block btn-ghost" data-cancel>' + esc(opts.cancel || 'Cancel') + '</button></div></div>';
      function close(v) { bg.remove(); resolve(v); }
      bg.addEventListener('click', function (e) {
        if (e.target === bg || e.target.closest('[data-cancel]')) close(false);
        else if (e.target.closest('[data-ok]')) close(true);
      });
      document.body.appendChild(bg);
    });
  }

  var ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
    resume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9.5l5 5M18 9.5l-5 5"/></svg>'
  };

  // Persistent storage request (helps keep offline leads safe)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }

  window.K = {
    LS: LS, api: api, ApiError: ApiError, Outbox: Outbox, sync: sync, status: status, on: on, emit: emit,
    uid: uid, esc: esc, digits: digits, fmtNum: fmtNum, fmtTime: fmtTime, initials: initials, sameName: sameName,
    toast: toast, confirmSheet: confirmSheet, ICONS: ICONS
  };
})();
