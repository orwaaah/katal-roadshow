/* KATAL Roadshow – admin dashboard + editors */
(function () {
  'use strict';
  var LS = K.LS, api = K.api, esc = K.esc, I = K.ICONS;
  var root = document.getElementById('admin');
  var session = LS.get('adminSession', null);   // { token, admin }
  var data = null;        // dashboard data
  var loadedAt = null;
  var ed = null;          // editor data { tabs: {...} }
  var view = LS.get('adminView', 'dashboard');
  var f = { q: '', agent: '', list: '', date: '' };
  var timer = null;

  var TYPES = [['single', 'Single choice'], ['multi', 'Multiple choice'], ['text', 'Short text'], ['number', 'Number'], ['range', 'Min–Max range'], ['project', 'Project picker']];
  var MATCH = ['Location', 'Property Type', 'Unit Type', 'Budget'];
  var VIEWS = [['dashboard', 'Dashboard'], ['questions', 'Questions'], ['agents', 'Agents'], ['projects', 'Projects'], ['units', 'Units'], ['admins', 'Admins'], ['settings', 'Settings']];

  Object.assign(I, {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  });

  function brand() {
    return '<div class="brand"><div class="brand-mark">K</div><div class="brand-text"><span class="brand-name">KATAL</span><span class="brand-sub">PROPERTY</span></div></div>';
  }
  function lists() { return (data && data.lists) || listNamesFromEd() || ['My Leads', 'Confirmed Guests', 'Final Leads']; }
  function listNamesFromEd() {
    if (!ed) return null;
    var g = function (k, d) { var r = ed.tabs.Settings.filter(function (x) { return norm(x.key) === k; })[0]; return (r && String(r.value).trim()) || d; };
    return [g('list1name', 'My Leads'), g('list2name', 'Confirmed Guests'), g('list3name', 'Final Leads')];
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function yes(v, d) { var s = String(v == null ? '' : v).trim().toLowerCase(); return s === '' ? !!d : /^(y|yes|true|1)/.test(s); }
  function yn(b) { return b ? 'Yes' : 'No'; }
  function splitList(v) { return String(v == null ? '' : v).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function statusOf(l) { return l.formAt ? 3 : l.confirmedAt ? 2 : 1; }
  function dayKey(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayLabel(key) {
    var today = dayKey(new Date().toISOString());
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (key === today) return 'Today';
    if (key === dayKey(y.toISOString())) return 'Yesterday';
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtFull(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function authFail(err) {
    if (err && err.code === 'AUTH') { session = null; LS.del('adminSession'); showLogin('Please sign in again.'); return true; }
    return false;
  }

  /* ================================ LOGIN ================================ */
  function showLogin(msg) {
    stopTimer();
    root.innerHTML = '<div class="adm-login">' + brand() +
      '<h1 class="title">Admin dashboard</h1><p class="subtitle">Enter your admin PIN.</p>' +
      '<form id="f"><input class="input" id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••••" aria-label="Admin PIN">' +
      '<div class="err" id="err">' + esc(msg || '') + '</div>' +
      '<button class="btn btn-primary btn-block" id="go">Sign in</button></form></div>';
    var pin = document.getElementById('pin');
    pin.focus();
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault();
      var v = pin.value.trim();
      if (!v) return;
      var btn = document.getElementById('go');
      btn.disabled = true; btn.textContent = 'Checking…';
      api('adminLogin', { pin: v }, { timeout: 40000 }).then(function (r) {
        session = { token: r.token, admin: r.admin || 'Admin' };
        LS.set('adminSession', session);
        data = null; ed = null;
        shell();
      }, function (err) {
        btn.disabled = false; btn.textContent = 'Sign in';
        document.getElementById('err').textContent = err.code === 'NETWORK' ? 'No internet connection.' : err.message;
        pin.select();
      });
    };
  }

  /* ================================ SHELL ================================ */
  function shell() {
    root.innerHTML = '<div class="adm">' +
      '<div class="adm-head"><div class="hgroup">' + brand() + '<div class="ev"><b id="evName">' + esc((data && data.eventName) || 'Roadshow') + '</b><span id="upd">' + esc(session.admin || '') + '</span></div></div>' +
      '<div class="adm-actions" id="actions"></div></div>' +
      '<nav class="adm-nav" id="nav">' + VIEWS.map(function (v) { return '<button data-view="' + v[0] + '"' + (view === v[0] ? ' class="on"' : '') + '>' + v[1] + '</button>'; }).join('') + '</nav>' +
      '<div id="view"></div></div>';
    document.getElementById('nav').onclick = function (e) {
      var b = e.target.closest('[data-view]');
      if (!b) return;
      view = b.getAttribute('data-view');
      LS.set('adminView', view);
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      showView();
    };
    showView();
  }
  function setActions(html) {
    var a = document.getElementById('actions');
    a.innerHTML = html + '<button class="btn btn-ghost switch-btn" id="toAgent">' + I.swap + ' Switch to agent</button><button class="btn btn-quiet" id="outBtn">Log out</button>';
    document.getElementById('toAgent').onclick = switchToAgent;
    document.getElementById('outBtn').onclick = function () {
      K.confirmSheet({ title: 'Log out of the dashboard?', ok: 'Log out', cancel: 'Cancel' }).then(function (y) {
        if (!y) return;
        session = null; data = null; ed = null; LS.del('adminSession'); LS.del('adminCache'); showLogin();
      });
    };
  }
  function viewBox() { return document.getElementById('view'); }
  function showView() {
    stopTimer();
    viewBox().onclick = null;
    if (view === 'dashboard') return loadDash(!data);
    setActions('');
    if (!ed) { viewBox().innerHTML = '<div class="center-msg" style="min-height:40vh"><div><div class="spinner"></div>Loading…</div></div>'; return loadEd(); }
    renderEditor();
  }

  /* ============================ AGENT MODE ============================ */
  // The admin uses the agent app with their own name; leads are saved under the admin's name.
  function switchToAgent() {
    var go = function () {
      var cur = LS.get('session', null);
      if (!cur || cur.token !== session.token) LS.set('session', { token: session.token, agent: session.admin || 'Admin', isAdmin: true, at: new Date().toISOString() });
      location.href = './';
    };
    var b = document.getElementById('toAgent');
    if (b) b.textContent = 'Opening…';
    api('myLeads', { token: session.token }, { timeout: 30000 }).then(go, function (err) {
      if (err.code === 'NETWORK') return go();
      if (b) b.innerHTML = I.swap + ' Switch to agent';
      K.toast(err.code === 'AUTH' ? 'Agent mode needs the newest server code. Paste the latest code in Apps Script first.' : err.message, 6000);
    });
  }

  /* ============================== DASHBOARD ============================== */
  var loading = false;
  function loadDash(spinner) {
    setActions('<button class="btn btn-ghost" id="refreshBtn">Refresh</button><button class="btn btn-primary" id="xlsBtn">Download Excel</button>');
    document.getElementById('refreshBtn').onclick = function () { loadDash(false); };
    document.getElementById('xlsBtn').onclick = exportExcel;
    if (data && !spinner) renderDash();
    if (spinner) viewBox().innerHTML = '<div class="center-msg" style="min-height:40vh"><div><div class="spinner"></div>Loading leads…</div></div>';
    if (loading) return;
    loading = true;
    var rb = document.getElementById('refreshBtn');
    if (rb) rb.textContent = 'Refreshing…';
    api('dashboard', { token: session.token }, { timeout: 45000 }).then(function (r) {
      loading = false;
      data = r;
      loadedAt = new Date();
      LS.set('adminCache', { data: r, at: loadedAt.toISOString() });
      var ev = document.getElementById('evName'); if (ev) ev.textContent = r.eventName;
      if (view === 'dashboard') { renderDash(); startTimer(); }
    }, function (err) {
      loading = false;
      if (authFail(err)) return;
      var b = document.getElementById('refreshBtn');
      if (b) b.textContent = 'Refresh';
      if (!data) {
        var c = LS.get('adminCache', null);
        if (c) { data = c.data; loadedAt = new Date(c.at); if (view === 'dashboard') renderDash(); K.toast('No internet — showing data from ' + fmtFull(c.at), 4000); return; }
        if (view === 'dashboard') viewBox().innerHTML = '<div class="notice warn" style="margin-top:20px">' + I.warn + '<div>' + esc(err.code === 'NETWORK' ? 'No internet connection.' : err.message) + '</div></div>';
        return;
      }
      K.toast(err.code === 'NETWORK' ? 'No internet — showing the last data' : err.message, 3500);
    });
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(function () { if (!document.hidden && view === 'dashboard' && !document.querySelector('.drawer-bg')) loadDash(false); }, 60000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  function dashColumns() {
    var seen = {}, cols = [];
    (data.questions || []).forEach(function (q) {
      if (!q.dashboard) return;
      var l = (q.label || q.text).trim();
      if (seen[l.toLowerCase()]) return;
      seen[l.toLowerCase()] = true;
      cols.push(l);
    });
    return cols;
  }
  function filtered() {
    var q = f.q.trim().toLowerCase(), qd = K.digits(q);
    return data.leads.filter(function (l) {
      if (f.agent && l.agent !== f.agent) return false;
      if (f.list && String(statusOf(l)) !== f.list) return false;
      if (f.date && dayKey(l.time) !== f.date) return false;
      if (q) {
        var hay = (l.name + ' ' + l.email + ' ' + l.agent).toLowerCase();
        if (hay.indexOf(q) < 0 && !(qd.length >= 3 && K.digits(l.phone).indexOf(qd) >= 0)) return false;
      }
      return true;
    });
  }

  function renderDash() {
    var L = lists();
    var leads = data.leads;
    var today = dayKey(new Date().toISOString());
    var k = { total: leads.length, today: 0, s2: 0, s3: 0 };
    var per = {};
    (data.agents || []).forEach(function (a) { if (a.active) per[a.name] = { name: a.name, total: 0, s1: 0, s2: 0, s3: 0, today: 0 }; });
    leads.forEach(function (l) {
      var st = statusOf(l);
      var isToday = dayKey(l.time) === today;
      if (isToday) k.today++;
      if (st === 2) k.s2++;
      if (st === 3) k.s3++;
      var p = per[l.agent] || (per[l.agent] = { name: l.agent, total: 0, s1: 0, s2: 0, s3: 0, today: 0 });
      p.total++;
      p['s' + st]++;
      if (isToday) p.today++;
    });
    var agents = Object.keys(per).map(function (n) { return per[n]; }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    var maxTotal = Math.max.apply(null, agents.map(function (a) { return a.total; }).concat([1]));
    var days = {};
    leads.forEach(function (l) { var d = dayKey(l.time); if (d) days[d] = true; });
    var dayOpts = Object.keys(days).sort().reverse();
    var cnt = function (n) { return n ? n : '<span class="zero">0</span>'; };

    viewBox().innerHTML =
      '<div class="kpis">' +
      '<div class="kpi accent"><span>Total leads</span><b>' + k.total + '</b></div>' +
      '<div class="kpi"><span>Added today</span><b>' + k.today + '</b></div>' +
      '<div class="kpi gold"><span>' + esc(L[1]) + '</span><b>' + k.s2 + '</b></div>' +
      '<div class="kpi ok"><span>' + esc(L[2]) + '</span><b>' + k.s3 + '</b></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Agents</h2><span class="muted">Tap an agent to see only their leads · updated ' + esc(loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</span></div><div class="tbl-wrap"><table class="tbl" id="agTbl"><thead><tr>' +
      '<th>Agent</th><th class="num">Leads</th><th class="num">' + esc(L[0]) + '</th><th class="num">' + esc(L[1]) + '</th><th class="num">' + esc(L[2]) + '</th><th class="num">Today</th></tr></thead><tbody>' +
      agents.map(function (a) {
        var isAdm = (data.admins || []).indexOf(a.name) >= 0;
        return '<tr data-agent="' + esc(a.name) + '"' + (f.agent === a.name ? ' class="sel"' : '') + '><td class="nm">' + esc(a.name) + (isAdm ? ' <span class="chip">Admin</span>' : '') + '<span class="bar" style="width:' + Math.round(60 * a.total / maxTotal) + 'px"></span></td>' +
          '<td class="num"><b>' + cnt(a.total) + '</b></td><td class="num">' + cnt(a.s1) + '</td><td class="num">' + cnt(a.s2) + '</td><td class="num">' + cnt(a.s3) + '</td><td class="num">' + cnt(a.today) + '</td></tr>';
      }).join('') + (agents.length ? '' : '<tr><td colspan="6" class="muted">No agents yet.</td></tr>') +
      '</tbody></table></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Leads</h2><span class="muted" id="showing"></span></div>' +
      '<div class="filters">' +
      '<input class="input" id="fq" type="search" placeholder="Search name, phone, email…" value="' + esc(f.q) + '">' +
      '<select id="fa"><option value="">All agents</option>' + agents.map(function (a) { return '<option' + (f.agent === a.name ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select>' +
      '<select id="fl"><option value="">All lists</option>' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (f.list === String(n) ? ' selected' : '') + '>' + esc(L[n - 1]) + '</option>'; }).join('') + '</select>' +
      '<select id="fd"><option value="">All dates</option>' + dayOpts.map(function (d) { return '<option value="' + d + '"' + (f.date === d ? ' selected' : '') + '>' + esc(dayLabel(d)) + '</option>'; }).join('') + '</select>' +
      '</div><div id="leadsBox"></div></div>';
    paintLeads();
    var rb = document.getElementById('refreshBtn'); if (rb) rb.textContent = 'Refresh';
    document.getElementById('fq').oninput = function (e) { f.q = e.target.value; paintLeads(); };
    document.getElementById('fa').onchange = function (e) { f.agent = e.target.value; renderDash(); };
    document.getElementById('fl').onchange = function (e) { f.list = e.target.value; paintLeads(); };
    document.getElementById('fd').onchange = function (e) { f.date = e.target.value; paintLeads(); };
    document.getElementById('agTbl').onclick = function (e) {
      var tr = e.target.closest('[data-agent]');
      if (!tr) return;
      var n = tr.getAttribute('data-agent');
      f.agent = f.agent === n ? '' : n;
      renderDash();
      var box = document.getElementById('leadsBox');
      if (box && f.agent) box.parentNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  function paintLeads() {
    var box = document.getElementById('leadsBox');
    if (!box) return;
    var L = lists();
    var cols = dashColumns();
    var rows = filtered();
    document.getElementById('showing').textContent = 'Showing ' + rows.length + ' of ' + data.leads.length + ' · newest first';
    if (!rows.length) { box.innerHTML = '<div class="empty">No leads match these filters.</div>'; return; }
    var chip = function (l) { var s = statusOf(l); return '<span class="chip s' + s + '">' + esc(L[s - 1]) + '</span>'; };
    box.innerHTML = '<div class="tbl-wrap leads-tbl"><table class="tbl"><thead><tr><th>Time</th><th>Agent</th><th>Client</th><th>Phone</th><th>List</th>' +
      cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th class="num">Notes</th></tr></thead><tbody>' +
      rows.map(function (l) {
        return '<tr data-id="' + esc(l.id) + '"><td class="tm">' + esc(fmtFull(l.time)) + '</td><td>' + esc(l.agent) + '</td><td class="nm">' + esc(l.name) + '</td><td class="ph">' + esc(l.phone) + '</td><td>' + chip(l) + '</td>' +
          cols.map(function (c) { return '<td class="ans">' + esc((l.cells || {})[c] || '') + '</td>'; }).join('') +
          '<td class="num">' + ((l.notes || []).length || '<span class="zero">0</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="mob-cards">' + rows.map(function (l) {
        var ans = cols.map(function (c) { var v = (l.cells || {})[c]; return v ? esc(c) + ': ' + esc(v) : ''; }).filter(Boolean).join(' · ');
        return '<div class="mcard" data-id="' + esc(l.id) + '"><div class="top"><span class="nm">' + esc(l.name) + '</span><span class="tm">' + esc(fmtFull(l.time)) + '</span></div>' +
          '<div class="sub">' + esc(l.phone) + ' · ' + esc(l.agent) + '</div>' + (ans ? '<div class="ans">' + ans + '</div>' : '') + chip(l) + '</div>';
      }).join('') + '</div>';
    box.onclick = function (e) {
      var r = e.target.closest('[data-id]');
      if (r) openLead(r.getAttribute('data-id'));
    };
  }

  function openLead(id) {
    var l = data.leads.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    var L = lists();
    var st = statusOf(l);
    var d = K.digits(l.phone);
    var answers = (l.answers || []).length
      ? '<dl class="answers">' + l.answers.map(function (a) {
        return '<div><dt>' + esc(a.question || a.label) + '</dt><dd>' + esc(a.skipped ? 'Skipped' : (l.cells && l.cells[a.label]) || answerText(a) || '—') + '</dd></div>';
      }).join('') + '</dl>'
      : '<p class="muted">The form has not been filled yet.</p>';
    var bg = document.createElement('div');
    bg.className = 'drawer-bg';
    bg.innerHTML = '<div class="drawer" role="dialog" aria-modal="true">' +
      '<div class="topbar"><span class="chip s' + st + '">' + esc(L[st - 1]) + '</span><button class="icon-btn" data-close aria-label="Close">' + I.close + '</button></div>' +
      '<h1 class="title">' + esc(l.name) + '</h1>' +
      '<div class="quick" style="grid-template-columns:repeat(2,1fr)"><a class="q-btn" href="tel:+' + esc(d) + '">Call</a><a class="q-btn" href="https://wa.me/' + esc(d) + '" target="_blank" rel="noopener">WhatsApp</a></div>' +
      '<div class="section"><h3>Details</h3><dl class="kv">' +
      '<dt>Phone</dt><dd>' + esc(l.phone) + '</dd>' +
      (l.email ? '<dt>Email</dt><dd>' + esc(l.email) + '</dd>' : '') +
      '<dt>Agent</dt><dd>' + esc(l.agent) + '</dd>' +
      '<dt>Added</dt><dd>' + esc(fmtFull(l.time)) + '</dd>' +
      '<dt>Invited</dt><dd>' + esc(l.invitedAt ? fmtFull(l.invitedAt) : '—') + '</dd>' +
      '<dt>Confirmed</dt><dd>' + esc(l.confirmedAt ? fmtFull(l.confirmedAt) : '—') + '</dd>' +
      '<dt>Form done</dt><dd>' + esc(l.formAt ? fmtFull(l.formAt) : '—') + '</dd>' +
      '</dl></div>' +
      '<div class="section"><h3>Answers</h3>' + answers + '</div>' +
      '<div class="section"><h3>Liked units</h3>' + ((l.liked || []).length ? '<ul class="liked">' + l.liked.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ul>' : '<p class="muted">None yet.</p>') + '</div>' +
      '<div class="section"><h3>Notes</h3>' + ((l.notes || []).length ? '<ul class="notes">' + l.notes.slice().reverse().map(function (n) {
        return '<li><p>' + esc(n.text) + '</p><span>' + esc(fmtFull(n.time)) + ' · ' + esc(n.agent) + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted">No notes.</p>') + '</div>' +
      '</div>';
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
    document.body.appendChild(bg);
  }

  function answerText(a) {
    var v = a.value;
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') {
      if (v.min && v.max) return K.fmtNum(v.min) + ' – ' + K.fmtNum(v.max);
      if (v.max) return 'Up to ' + K.fmtNum(v.max);
      if (v.min) return 'From ' + K.fmtNum(v.min);
      return '';
    }
    return String(v);
  }

  var xlsxPromise = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/vendor/xlsx.full.min.js'; // SheetJS 0.18.5 (Apache-2.0), loaded only when exporting
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { xlsxPromise = null; reject(new Error('Could not load the Excel tool (check internet).')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }
  function exportExcel() {
    if (!data) return;
    var btn = document.getElementById('xlsBtn');
    btn.textContent = 'Preparing…';
    loadXlsx().then(function (XLSX) {
      var L = lists();
      var cols = data.columns || [];
      var rows = filtered().map(function (l) {
        var o = {
          'Lead ID': l.id, 'Time': fmtFull(l.time), 'Agent': l.agent, 'Client Name': l.name, 'Phone': l.phone, 'Email': l.email || '',
          'List': L[statusOf(l) - 1], 'Invited At': l.invitedAt ? fmtFull(l.invitedAt) : '', 'Confirmed At': l.confirmedAt ? fmtFull(l.confirmedAt) : '',
          'Form Done At': l.formAt ? fmtFull(l.formAt) : '', 'Liked Units': (l.liked || []).join('; ')
        };
        cols.forEach(function (c) { o[c] = (l.cells || {})[c] || ''; });
        o['Notes'] = (l.notes || []).map(function (n) { return fmtFull(n.time) + ' ' + n.agent + ': ' + n.text; }).join('\n');
        return o;
      });
      var ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0] || { a: 1 }).map(function (k) { return { wch: Math.min(40, Math.max(12, k.length + 2)) }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      XLSX.writeFile(wb, 'KATAL-Roadshow-Leads-' + dayKey(new Date().toISOString()) + '.xlsx');
      btn.textContent = 'Download Excel';
    }, function (err) {
      btn.textContent = 'Download Excel';
      K.toast(err.message, 4000);
    });
  }

  /* =============================== EDITORS =============================== */
  function loadEd() {
    return api('adminData', { token: session.token }, { timeout: 45000 }).then(function (r) {
      ed = { tabs: r.tabs };
      if (view !== 'dashboard') renderEditor();
    }, function (err) {
      if (authFail(err)) return;
      if (view !== 'dashboard') viewBox().innerHTML = '<div class="notice warn" style="margin-top:20px">' + I.warn + '<div>' + esc(err.code === 'NETWORK' ? 'No internet connection.' : err.message) + '</div></div>' +
        '<button class="btn btn-ghost" style="margin-top:12px" id="retryEd">Try again</button>';
      var rb = document.getElementById('retryEd'); if (rb) rb.onclick = function () { showView(); };
    });
  }

  var saving = false;
  function save(tab, rows, extra) {
    if (saving) return Promise.reject(new Error('busy'));
    saving = true;
    K.toast('Saving…', 20000);
    return api('adminSave', Object.assign({ token: session.token, tab: tab, rows: rows }, extra || {}), { timeout: 45000 }).then(function (r) {
      saving = false;
      ed.tabs[tab] = rows;
      if (r.token) { session.token = r.token; LS.set('adminSession', session); }
      data = null; // dashboard data may have changed (names, lists)
      K.toast('Saved ✓');
      return r;
    }, function (err) {
      saving = false;
      if (authFail(err)) throw err;
      K.toast(err.code === 'NETWORK' ? 'No internet — not saved.' : err.message, 5000);
      throw err;
    });
  }

  function renderEditor() {
    if (view === 'questions') return edQuestions();
    if (view === 'agents') return edPeople('Agents');
    if (view === 'admins') return edPeople('Admins');
    if (view === 'projects') return edProjects();
    if (view === 'units') return edUnits();
    if (view === 'settings') return edSettings();
  }

  /* ----- modal form helper ----- */
  function modal(title, bodyHtml, opts) {
    opts = opts || {};
    var bg = document.createElement('div');
    bg.className = 'sheet-bg modal-bg';
    bg.innerHTML = '<div class="sheet mbox" role="dialog" aria-modal="true"><div class="mhead"><h3>' + esc(title) + '</h3><button class="icon-btn" data-x aria-label="Close">' + I.close + '</button></div>' +
      '<div class="mbody">' + bodyHtml + '</div><div class="err" data-err></div>' +
      '<div class="mfoot">' + (opts.del ? '<button class="btn btn-ghost danger-t" data-del>' + I.trash + ' Delete</button>' : '<span></span>') +
      '<div><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" data-ok>' + esc(opts.ok || 'Save') + '</button></div></div></div>';
    document.body.appendChild(bg);
    var m = {
      el: bg,
      body: bg.querySelector('.mbody'),
      close: function () { bg.remove(); },
      error: function (t) { bg.querySelector('[data-err]').textContent = t || ''; }
    };
    bg.addEventListener('click', function (e) {
      if (e.target === bg || e.target.closest('[data-x]')) return m.close();
      if (e.target.closest('[data-ok]') && opts.onOk) return opts.onOk(m);
      if (e.target.closest('[data-del]') && opts.onDel) return opts.onDel(m);
    });
    var first = bg.querySelector('input,select,textarea');
    if (first && !('ontouchstart' in window)) setTimeout(function () { first.focus(); }, 50);
    return m;
  }
  function fld(label, inner, hint) {
    return '<label class="mf"><span class="ml">' + esc(label) + '</span>' + inner + (hint ? '<span class="mh">' + hint + '</span>' : '') + '</label>';
  }
  function txt(name, val, attrs) { return '<input class="input" data-f="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '>'; }
  function tog(name, on, label) {
    return '<label class="tog"><input type="checkbox" data-f="' + name + '"' + (on ? ' checked' : '') + '><span class="tg"></span><span>' + esc(label) + '</span></label>';
  }
  function sel(name, options, val) {
    return '<select class="input" data-f="' + name + '">' + options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '</select>';
  }
  function readForm(m) {
    var o = {};
    Array.prototype.forEach.call(m.el.querySelectorAll('[data-f]'), function (el) {
      o[el.getAttribute('data-f')] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return o;
  }

  /* ----- Questions ----- */
  function typeKey(t) {
    var s = String(t || '').toLowerCase();
    if (s.indexOf('multi') >= 0) return 'multi';
    if (s.indexOf('range') >= 0 || s.indexOf('min') >= 0) return 'range';
    if (s.indexOf('project') >= 0) return 'project';
    if (s.indexOf('number') >= 0) return 'number';
    if (s.indexOf('text') >= 0) return 'text';
    return 'single';
  }
  function typeName(k) { return (TYPES.filter(function (t) { return t[0] === k; })[0] || TYPES[0])[1]; }
  function qList() {
    return ed.tabs.Questions.map(function (r, i) {
      return {
        id: String(r.id || '').trim(), order: Number(r.order) || 9999, i: i, text: String(r.text || ''), label: String(r.label || ''),
        type: typeKey(r.type), options: splitList(r.options), maxPicks: String(r.maxPicks || ''), skippable: yes(r.skippable, false),
        showIfId: String(r.showIfId || '').trim(), showIfAnswers: splitList(r.showIfAnswers), active: yes(r.active, true),
        dashboard: yes(r.dashboard, false), matchField: String(r.matchField || '')
      };
    }).sort(function (a, b) { return a.order - b.order || a.i - b.i; });
  }
  function qRows(qs) {
    return qs.map(function (q, i) {
      return {
        id: q.id, order: i + 1, text: q.text, label: q.label || q.text, type: typeName(q.type), options: q.options.join(', '),
        maxPicks: q.type === 'multi' ? q.maxPicks : '', skippable: yn(q.skippable), showIfId: q.showIfId,
        showIfAnswers: q.showIfId ? q.showIfAnswers.join(', ') : '', active: yn(q.active), dashboard: yn(q.dashboard), matchField: q.matchField
      };
    });
  }
  function newQid(qs) {
    var max = 0;
    qs.forEach(function (q) { var m = /^Q(\d+)/i.exec(q.id); if (m) max = Math.max(max, Number(m[1])); });
    return 'Q' + (max + 1);
  }
  function orderProblem(qs) {
    for (var i = 0; i < qs.length; i++) {
      if (!qs[i].showIfId) continue;
      var pi = -1;
      qs.forEach(function (x, j) { if (x.id.toLowerCase() === qs[i].showIfId.toLowerCase()) pi = j; });
      if (pi > i) return '“' + qs[i].text + '” depends on “' + qs[pi].text + '”, so it must come after it.';
    }
    return '';
  }
  function edQuestions() {
    var qs = qList();
    var byId = {};
    qs.forEach(function (q, i) { byId[q.id.toLowerCase()] = i + 1; });
    viewBox().innerHTML = '<div class="ed-head"><div><h2>Questions</h2><p class="muted">Agents see the questions in this order. Changes reach agents when they reopen the app.</p></div>' +
      '<button class="btn btn-primary" id="addQ">+ Add question</button></div>' +
      '<ol class="ed-list">' + qs.map(function (q, i) {
        var chips = '<span class="chip">' + esc(typeName(q.type)) + '</span>';
        if (q.skippable) chips += '<span class="chip">Optional</span>';
        if (!q.active) chips += '<span class="chip off">Hidden</span>';
        if (q.dashboard) chips += '<span class="chip s2">On dashboard</span>';
        if (q.matchField) chips += '<span class="chip s3">Matching: ' + esc(q.matchField) + '</span>';
        if (q.showIfId) chips += '<span class="chip">Only if Q' + (byId[q.showIfId.toLowerCase()] || '?') + ' = ' + esc(q.showIfAnswers.join(' / ') || 'answered') + '</span>';
        var answers = (q.type === 'single' || q.type === 'multi') ? '<div class="ed-sub">' + esc(q.options.join(' · ')) + '</div>' : '';
        return '<li class="ed-item' + (q.active ? '' : ' is-off') + '"><span class="ed-num">' + (i + 1) + '</span>' +
          '<div class="ed-main" data-edit="' + i + '"><div class="ed-t">' + esc(q.text) + '</div>' + answers + '<div class="ed-chips">' + chips + '</div></div>' +
          '<div class="ed-acts"><button class="icon-btn sm" data-up="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + I.up + '</button>' +
          '<button class="icon-btn sm" data-down="' + i + '" aria-label="Move down"' + (i === qs.length - 1 ? ' disabled' : '') + '>' + I.down + '</button>' +
          '<button class="icon-btn sm" data-edit="' + i + '" aria-label="Edit">' + I.edit + '</button></div></li>';
      }).join('') + '</ol>';
    document.getElementById('addQ').onclick = function () { qForm(qs, -1); };
    viewBox().querySelector('.ed-list').onclick = function (e) {
      var b;
      if ((b = e.target.closest('[data-up]'))) return moveQ(qs, Number(b.getAttribute('data-up')), -1);
      if ((b = e.target.closest('[data-down]'))) return moveQ(qs, Number(b.getAttribute('data-down')), 1);
      if ((b = e.target.closest('[data-edit]'))) return qForm(qs, Number(b.getAttribute('data-edit')));
    };
  }
  function moveQ(qs, i, d) {
    var j = i + d;
    if (j < 0 || j >= qs.length) return;
    var copy = qs.slice();
    var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    var p = orderProblem(copy);
    if (p) return K.toast(p, 5000);
    save('Questions', qRows(copy)).then(edQuestions, function () { /* toast shown */ });
  }
  function qForm(qs, idx) {
    var isNew = idx < 0;
    var q = isNew ? { id: newQid(qs), text: '', label: '', type: 'single', options: ['', ''], maxPicks: '', skippable: false, showIfId: '', showIfAnswers: [], active: true, dashboard: false, matchField: '' }
      : JSON.parse(JSON.stringify(qs[idx]));
    var before = isNew ? qs : qs.slice(0, idx);
    var m = modal(isNew ? 'New question' : 'Edit question', '', {
      del: !isNew,
      onOk: function () {
        collect();
        if (!q.text) return m.error('Write the question.');
        if (q.type === 'single' || q.type === 'multi') {
          q.options = q.options.map(function (o) { return o.trim(); }).filter(Boolean);
          if (q.options.length < 1) return m.error('Add at least one answer.');
          if (q.options.some(function (o) { return o.indexOf(',') >= 0; })) return m.error('Answers cannot contain commas.');
        } else q.options = [];
        if (q.showIfId && !q.showIfAnswers.length && (parentOf() || {}).type !== 'text') return m.error('Pick the answers that make this question appear, or choose “Always show”.');
        if (!q.label) q.label = q.text;
        var copy = qs.slice();
        if (isNew) copy.push(q); else copy[idx] = q;
        save('Questions', qRows(copy)).then(function () { m.close(); edQuestions(); }, function () { /* toast */ });
      },
      onDel: function () {
        K.confirmSheet({ title: 'Delete this question?', text: 'Answers already saved stay in the leads.', ok: 'Delete', cancel: 'Keep', danger: true }).then(function (y) {
          if (!y) return;
          var copy = qs.filter(function (x, i) { return i !== idx; });
          copy.forEach(function (x) { if (x.showIfId && x.showIfId.toLowerCase() === q.id.toLowerCase()) { x.showIfId = ''; x.showIfAnswers = []; } });
          save('Questions', qRows(copy)).then(function () { m.close(); edQuestions(); }, function () { /* toast */ });
        });
      }
    });
    function parentOf() { return before.filter(function (x) { return x.id.toLowerCase() === q.showIfId.toLowerCase(); })[0]; }
    function collect() {
      var v = readForm(m);
      q.text = v.text; q.label = v.label; q.type = v.type; q.maxPicks = v.maxPicks || '';
      q.skippable = v.skippable; q.active = v.active; q.dashboard = v.dashboard; q.matchField = v.matchField;
      q.showIfId = v.showIfId || '';
      q.options = Array.prototype.map.call(m.el.querySelectorAll('[data-opt]'), function (el) { return el.value; });
      var sa = m.el.querySelectorAll('[data-sa]:checked');
      var st = m.el.querySelector('[data-satext]');
      q.showIfAnswers = st ? splitList(st.value) : Array.prototype.map.call(sa, function (el) { return el.value; });
    }
    function paint() {
      var parent = parentOf();
      var parentAnswers = parent ? (parent.type === 'project' ? ((ed.tabs.Projects || []).map(function (p) { return String(p.name); })) : parent.options) : [];
      var opts = (q.type === 'single' || q.type === 'multi')
        ? fld('Answers', '<div class="opts">' + q.options.map(function (o, i) {
          return '<div class="opt-row"><input class="input" data-opt value="' + esc(o) + '" placeholder="Answer ' + (i + 1) + '">' +
            '<button type="button" class="icon-btn sm" data-oup="' + i + '"' + (i === 0 ? ' disabled' : '') + '>' + I.up + '</button>' +
            '<button type="button" class="icon-btn sm" data-odown="' + i + '"' + (i === q.options.length - 1 ? ' disabled' : '') + '>' + I.down + '</button>' +
            '<button type="button" class="icon-btn sm" data-odel="' + i + '">' + I.close + '</button></div>';
        }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-oadd>+ Add answer</button></div>')
        : '';
      m.body.innerHTML =
        fld('Question', '<textarea class="input" data-f="text" rows="2" placeholder="e.g. What is your budget?">' + esc(q.text) + '</textarea>') +
        fld('Short label', txt('label', q.label, 'placeholder="e.g. Budget"'), 'Used as the column name on the dashboard and in Excel. Questions with the same label share one column.') +
        fld('Type', sel('type', TYPES, q.type)) +
        opts +
        (q.type === 'multi' ? fld('Max picks', txt('maxPicks', q.maxPicks, 'inputmode="numeric" placeholder="No limit"')) : '') +
        '<div class="tog-grid">' + tog('skippable', q.skippable, 'Optional (agent can skip)') + tog('active', q.active, 'Visible to agents') + tog('dashboard', q.dashboard, 'Show on dashboard') + '</div>' +
        fld('Show this question', sel('showIfId', [['', 'Always']].concat(before.filter(function (x) { return x.id !== q.id; }).map(function (x) {
          var n = qs.indexOf(x) + 1;
          return [x.id, 'Only if Q' + n + ' — ' + x.text.slice(0, 60)];
        })), q.showIfId)) +
        (parent ? (parent.type === 'text' || parent.type === 'number' || parent.type === 'range'
          ? fld('…is answered with', '<input class="input" data-satext value="' + esc(q.showIfAnswers.join(', ')) + '" placeholder="Any answer">')
          : fld('…is answered with', '<div class="checks">' + parentAnswers.map(function (a) {
            return '<label class="chk"><input type="checkbox" data-sa value="' + esc(a) + '"' + (q.showIfAnswers.some(function (x) { return x.toLowerCase() === a.toLowerCase(); }) ? ' checked' : '') + '><span>' + esc(a) + '</span></label>';
          }).join('') + '</div>')) : '') +
        fld('Use for unit matching', sel('matchField', [['', 'No']].concat(MATCH.map(function (x) { return [x, x]; })), q.matchField), 'Location, property type, unit type and budget answers are used to suggest units.');
    }
    m.body.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-f');
      if (k === 'type' || k === 'showIfId') {
        collect();
        if (k === 'type' && (q.type === 'single' || q.type === 'multi') && !q.options.filter(Boolean).length) q.options = ['', ''];
        if (k === 'showIfId') q.showIfAnswers = [];
        paint();
      }
    });
    m.body.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-oadd]'))) { collect(); q.options.push(''); paint(); var ins = m.el.querySelectorAll('[data-opt]'); ins[ins.length - 1].focus(); return; }
      if ((b = e.target.closest('[data-odel]'))) { collect(); q.options.splice(Number(b.getAttribute('data-odel')), 1); paint(); return; }
      if ((b = e.target.closest('[data-oup]'))) { collect(); var i = Number(b.getAttribute('data-oup')); var t = q.options[i]; q.options[i] = q.options[i - 1]; q.options[i - 1] = t; paint(); return; }
      if ((b = e.target.closest('[data-odown]'))) { collect(); var j = Number(b.getAttribute('data-odown')); var t2 = q.options[j]; q.options[j] = q.options[j + 1]; q.options[j + 1] = t2; paint(); return; }
    });
    paint();
  }

  /* ----- Agents / Admins ----- */
  function edPeople(tab) {
    var isAg = tab === 'Agents';
    var rows = ed.tabs[tab].map(function (r) { return { name: String(r.name || ''), pin: String(r.pin || ''), active: yes(r.active, true) }; });
    var counts = {};
    if (isAg && data) data.leads.forEach(function (l) { counts[l.agent] = (counts[l.agent] || 0) + 1; });
    viewBox().innerHTML = '<div class="ed-head"><div><h2>' + (isAg ? 'Agents' : 'Admins') + '</h2><p class="muted">' +
      (isAg ? 'Agents sign in to the agent app with their name and a 4-digit PIN. They only see their own leads.' : 'Admins open this dashboard with their own PIN (4–12 digits). Every admin needs a different PIN.') + '</p></div>' +
      '<button class="btn btn-primary" id="addP">+ Add ' + (isAg ? 'agent' : 'admin') + '</button></div>' +
      '<div class="panel" style="margin-top:14px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>PIN</th><th>Status</th>' + (isAg ? '<th class="num">Leads</th>' : '') + '<th></th></tr></thead><tbody>' +
      rows.map(function (p, i) {
        var me = !isAg && session.admin && p.name.toLowerCase() === String(session.admin).toLowerCase();
        return '<tr data-i="' + i + '"><td class="nm">' + esc(p.name) + (me ? ' <span class="chip">You</span>' : '') + '</td><td class="ph">' + esc(p.pin) + '</td>' +
          '<td>' + (p.active ? '<span class="chip s3">Active</span>' : '<span class="chip off">Blocked</span>') + '</td>' +
          (isAg ? '<td class="num">' + (data ? (counts[p.name] || 0) : '–') + '</td>' : '') +
          '<td class="num"><button class="btn btn-ghost btn-sm">Edit</button></td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="5" class="muted">Nobody yet.</td></tr>') + '</tbody></table></div></div>';
    document.getElementById('addP').onclick = function () { personForm(tab, rows, -1); };
    viewBox().querySelector('tbody').onclick = function (e) {
      var tr = e.target.closest('[data-i]');
      if (tr) personForm(tab, rows, Number(tr.getAttribute('data-i')));
    };
  }
  function personForm(tab, rows, idx) {
    var isAg = tab === 'Agents';
    var isNew = idx < 0;
    var p = isNew ? { name: '', pin: '', active: true } : rows[idx];
    var me = !isAg && !isNew && session.admin && p.name.toLowerCase() === String(session.admin).toLowerCase();
    var m = modal(isNew ? (isAg ? 'New agent' : 'New admin') : 'Edit ' + p.name,
      fld('Name', txt('name', p.name, 'autocomplete="off" placeholder="Full name"')) +
      fld('PIN', txt('pin', p.pin, 'inputmode="numeric" autocomplete="off" maxlength="' + (isAg ? 4 : 12) + '" placeholder="' + (isAg ? '4 digits' : '4–12 digits') + '"'),
        isAg ? 'The agent types this PIN to sign in. Changing it signs the agent out.' : (me ? 'This is you. You will stay signed in.' : '')) +
      tog('active', p.active, isAg ? 'Can sign in' : 'Can open the dashboard') +
      (isAg && !isNew ? '<p class="mh" style="margin-top:12px">Renaming keeps all of the agent’s leads.</p>' : ''),
      {
        del: !isNew,
        onOk: function () {
          var v = readForm(m);
          var pin = K.digits(v.pin);
          if (!v.name) return m.error('Write the name.');
          if (isAg && pin.length !== 4) return m.error('The PIN must be exactly 4 digits.');
          if (!isAg && (pin.length < 4 || pin.length > 12)) return m.error('The PIN must be 4 to 12 digits.');
          var copy = rows.map(function (x) { return Object.assign({}, x); });
          var np = { name: v.name.replace(/\s+/g, ' '), pin: pin, active: v.active };
          if (copy.some(function (x, i) { return i !== idx && x.name.toLowerCase() === np.name.toLowerCase(); })) return m.error('Somebody already has this name.');
          if (!isAg && copy.some(function (x, i) { return i !== idx && x.pin.replace(/^0+/, '') === pin.replace(/^0+/, ''); })) return m.error('Another admin already uses this PIN.');
          if (isNew) copy.push(np); else copy[idx] = np;
          var extra = {};
          if (isAg && !isNew && p.name !== np.name) extra.renames = [{ from: p.name, to: np.name }];
          if (!isAg) extra.selfName = me ? np.name : session.admin;
          var out = copy.map(function (x) { return { name: x.name, pin: x.pin, active: yn(x.active) }; });
          save(tab, out, extra).then(function () {
            if (me) { session.admin = np.name; LS.set('adminSession', session); }
            m.close(); edPeople(tab);
          }, function () { /* toast */ });
        },
        onDel: function () {
          if (me) return m.error('You cannot delete yourself.');
          K.confirmSheet({ title: 'Delete ' + p.name + '?', text: isAg ? 'Their leads stay on the dashboard. To only stop them signing in, turn off “Can sign in” instead.' : 'They will not be able to open the dashboard.', ok: 'Delete', cancel: 'Keep', danger: true }).then(function (y) {
            if (!y) return;
            var out = rows.filter(function (x, i) { return i !== idx; }).map(function (x) { return { name: x.name, pin: x.pin, active: yn(x.active) }; });
            save(tab, out, isAg ? {} : { selfName: session.admin }).then(function () { m.close(); edPeople(tab); }, function () { /* toast */ });
          });
        }
      });
  }

  /* ----- Projects ----- */
  function answerOptions(match) {
    var out = [];
    qList().forEach(function (q) { if (norm(q.matchField) === norm(match)) q.options.forEach(function (o) { if (out.indexOf(o) < 0) out.push(o); }); });
    return out;
  }
  function datalist(id, values) { return '<datalist id="' + id + '">' + values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>'; }
  function edProjects() {
    var ps = ed.tabs.Projects.map(function (r) { return Object.assign({}, r, { active: yes(r.active, true) }); });
    var unitCount = {};
    ed.tabs.Units.forEach(function (u) { unitCount[String(u.project)] = (unitCount[String(u.project)] || 0) + 1; });
    viewBox().innerHTML = '<div class="ed-head"><div><h2>Projects</h2><p class="muted">Shown in the “Which project?” question and on the unit suggestions.</p></div><button class="btn btn-primary" id="addPr">+ Add project</button></div>' +
      '<div class="cards">' + ps.map(function (p, i) {
        return '<button class="ecard' + (p.active ? '' : ' is-off') + '" data-i="' + i + '"><b>' + esc(p.name) + '</b><span>' + esc([p.location, p.developer].filter(Boolean).join(' · ')) + '</span>' +
          '<span class="muted small">' + esc([p.handover ? 'Handover ' + p.handover : '', p.paymentPlan ? 'Plan ' + p.paymentPlan : ''].filter(Boolean).join(' · ')) + '</span>' +
          '<span class="ed-chips"><span class="chip">' + (unitCount[String(p.name)] || 0) + ' units</span>' + (p.active ? '' : '<span class="chip off">Hidden</span>') + '</span></button>';
      }).join('') + (ps.length ? '' : '<p class="muted">No projects yet.</p>') + '</div>';
    document.getElementById('addPr').onclick = function () { projectForm(ps, -1); };
    viewBox().querySelector('.cards').onclick = function (e) { var b = e.target.closest('[data-i]'); if (b) projectForm(ps, Number(b.getAttribute('data-i'))); };
  }
  function projectForm(ps, idx) {
    var isNew = idx < 0;
    var p = isNew ? { name: '', developer: '', location: '', handover: '', paymentPlan: '', brochure: '', active: true } : ps[idx];
    var m = modal(isNew ? 'New project' : 'Edit project',
      fld('Project name', txt('name', p.name)) +
      fld('Developer', txt('developer', p.developer)) +
      fld('Location', txt('location', p.location, 'list="dl-loc"') + datalist('dl-loc', answerOptions('Location')), 'Use the same words as the Location answers so units can be matched.') +
      fld('Handover', txt('handover', p.handover, 'placeholder="e.g. Q4 2028"')) +
      fld('Payment plan', txt('paymentPlan', p.paymentPlan, 'placeholder="e.g. 60/40"')) +
      fld('Brochure link', txt('brochure', p.brochure, 'placeholder="https://…"')) +
      tog('active', p.active, 'Visible to agents'),
      {
        del: !isNew,
        onOk: function () {
          var v = readForm(m);
          if (!v.name) return m.error('Write the project name.');
          if (ps.some(function (x, i) { return i !== idx && String(x.name).toLowerCase() === v.name.toLowerCase(); })) return m.error('A project with this name already exists.');
          var copy = ps.slice();
          var np = { name: v.name, developer: v.developer, location: v.location, handover: v.handover, paymentPlan: v.paymentPlan, brochure: v.brochure, active: v.active };
          if (isNew) copy.push(np); else copy[idx] = np;
          var extra = (!isNew && String(p.name) !== v.name) ? { renames: [{ from: String(p.name), to: v.name }] } : {};
          save('Projects', copy.map(projRow), extra).then(function () {
            if (extra.renames) ed.tabs.Units.forEach(function (u) { if (String(u.project) === String(p.name)) u.project = v.name; });
            m.close(); edProjects();
          }, function () { /* toast */ });
        },
        onDel: function () {
          var n = ed.tabs.Units.filter(function (u) { return String(u.project) === String(p.name); }).length;
          K.confirmSheet({ title: 'Delete ' + p.name + '?', text: n ? 'Its ' + n + ' unit(s) will be deleted too.' : '', ok: 'Delete', cancel: 'Keep', danger: true }).then(function (y) {
            if (!y) return;
            var copy = ps.filter(function (x, i) { return i !== idx; });
            save('Projects', copy.map(projRow)).then(function () {
              if (!n) { m.close(); return edProjects(); }
              var units = ed.tabs.Units.filter(function (u) { return String(u.project) !== String(p.name); });
              return save('Units', units).then(function () { m.close(); edProjects(); });
            }, function () { /* toast */ });
          });
        }
      });
  }
  function projRow(p) { return { name: p.name, developer: p.developer, location: p.location, handover: p.handover, paymentPlan: p.paymentPlan, brochure: p.brochure, active: yn(yes(p.active, true)) }; }

  /* ----- Units ----- */
  function edUnits() {
    var us = ed.tabs.Units.map(function (r) { return Object.assign({}, r, { available: yes(r.available, true) }); });
    var projects = ed.tabs.Projects.map(function (p) { return String(p.name); });
    var groups = {};
    us.forEach(function (u, i) { var k = String(u.project); (groups[k] = groups[k] || []).push(i); });
    var names = projects.concat(Object.keys(groups).filter(function (k) { return projects.indexOf(k) < 0; }));
    viewBox().innerHTML = '<div class="ed-head"><div><h2>Units</h2><p class="muted">Available units are suggested to agents after the form. Starting price is compared with the client’s maximum budget.</p></div><button class="btn btn-primary" id="addU">+ Add unit</button></div>' +
      names.map(function (pn) {
        var list = groups[pn] || [];
        return '<div class="panel"><div class="panel-head"><h2>' + esc(pn) + '</h2><button class="btn btn-ghost btn-sm" data-addu="' + esc(pn) + '">+ Add unit</button></div>' +
          (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property type</th><th>Unit type</th><th class="num">Starting price (AED)</th><th class="num">Size from (sq ft)</th><th>Status</th></tr></thead><tbody>' +
            list.map(function (i) {
              var u = us[i];
              return '<tr data-u="' + i + '"><td>' + esc(u.propertyType) + '</td><td class="nm">' + esc(u.unitType) + '</td><td class="num">' + K.fmtNum(Number(String(u.price).replace(/[^\d.]/g, ''))) + '</td><td class="num">' + (u.size ? K.fmtNum(Number(String(u.size).replace(/[^\d.]/g, ''))) : '') + '</td>' +
                '<td>' + (u.available ? '<span class="chip s3">Available</span>' : '<span class="chip off">Not available</span>') + '</td></tr>';
            }).join('') + '</tbody></table></div>' : '<p class="muted" style="padding:14px 18px;margin:0">No units yet.</p>') + '</div>';
      }).join('');
    document.getElementById('addU').onclick = function () { unitForm(us, -1, projects[0] || ''); };
    viewBox().onclick = function (e) {
      var b = e.target.closest('[data-addu]');
      if (b) return unitForm(us, -1, b.getAttribute('data-addu'));
      var tr = e.target.closest('[data-u]');
      if (tr) unitForm(us, Number(tr.getAttribute('data-u')));
    };
  }
  function unitForm(us, idx, project) {
    var isNew = idx < 0;
    var u = isNew ? { project: project, propertyType: '', unitType: '', price: '', size: '', available: true } : us[idx];
    var projects = ed.tabs.Projects.map(function (p) { return String(p.name); });
    if (u.project && projects.indexOf(String(u.project)) < 0) projects.push(String(u.project));
    var m = modal(isNew ? 'New unit' : 'Edit unit',
      fld('Project', sel('project', projects, u.project)) +
      fld('Property type', txt('propertyType', u.propertyType, 'list="dl-pt"') + datalist('dl-pt', answerOptions('Property Type'))) +
      fld('Unit type', txt('unitType', u.unitType, 'list="dl-ut"') + datalist('dl-ut', answerOptions('Unit Type')), 'Use the same words as the answers (e.g. 2BR) so units can be matched.') +
      fld('Starting price (AED)', txt('price', u.price ? K.fmtNum(Number(String(u.price).replace(/[^\d.]/g, ''))) : '', 'inputmode="numeric" placeholder="e.g. 1,500,000"')) +
      fld('Size from (sq ft)', txt('size', u.size ? K.fmtNum(Number(String(u.size).replace(/[^\d.]/g, ''))) : '', 'inputmode="numeric"')) +
      tog('available', u.available, 'Available'),
      {
        del: !isNew,
        onOk: function () {
          var v = readForm(m);
          if (!v.project) return m.error('Pick a project (add one in Projects first).');
          var price = Number(K.digits(v.price));
          if (!price) return m.error('Write the starting price.');
          var copy = us.slice();
          var nu = { project: v.project, propertyType: v.propertyType, unitType: v.unitType, price: price, size: Number(K.digits(v.size)) || '', available: yn(v.available) };
          if (isNew) copy.push(nu); else copy[idx] = nu;
          save('Units', copy.map(unitRow)).then(function () { m.close(); edUnits(); }, function () { /* toast */ });
        },
        onDel: function () {
          K.confirmSheet({ title: 'Delete this unit?', ok: 'Delete', cancel: 'Keep', danger: true }).then(function (y) {
            if (!y) return;
            save('Units', us.filter(function (x, i) { return i !== idx; }).map(unitRow)).then(function () { m.close(); edUnits(); }, function () { /* toast */ });
          });
        }
      });
  }
  function unitRow(u) {
    return { project: u.project, propertyType: u.propertyType, unitType: u.unitType, price: Number(String(u.price).replace(/[^\d.]/g, '')) || 0, size: u.size === '' ? '' : (Number(String(u.size).replace(/[^\d.]/g, '')) || ''), available: yn(yes(u.available, true)) };
  }

  /* ----- Settings ----- */
  var SETTINGS = [
    ['Event Name', 'Shown at the top of the agent app and the dashboard.'],
    ['List 1 Name', 'List of new leads (added, not confirmed yet).'],
    ['List 2 Name', 'List of leads who confirmed they are coming.'],
    ['List 3 Name', 'List of leads who answered the form.'],
    ['Invitation Link', 'Opened by the “Send invitation” button.'],
    ['Default Country Code', 'Selected by default on the phone field, e.g. +971.']
  ];
  function edSettings() {
    var rows = ed.tabs.Settings;
    var val = function (k) { var r = rows.filter(function (x) { return norm(x.key) === norm(k); })[0]; return r ? String(r.value) : ''; };
    viewBox().innerHTML = '<div class="ed-head"><div><h2>Settings</h2><p class="muted">Names and links used by the app.</p></div></div>' +
      '<div class="panel form-panel">' + SETTINGS.map(function (s, i) {
        return fld(s[0], '<input class="input" data-set="' + i + '" value="' + esc(val(s[0])) + '">', esc(s[1]));
      }).join('') + '<div class="mfoot" style="border:none;padding:6px 0 0"><span></span><button class="btn btn-primary" id="saveSet">Save settings</button></div></div>';
    document.getElementById('saveSet').onclick = function () {
      var out = rows.map(function (r) { return { key: r.key, value: r.value, help: r.help }; });
      SETTINGS.forEach(function (s, i) {
        var v = viewBox().querySelector('[data-set="' + i + '"]').value.trim();
        var r = out.filter(function (x) { return norm(x.key) === norm(s[0]); })[0];
        if (r) r.value = v; else out.push({ key: s[0], value: v, help: s[1] });
      });
      save('Settings', out).then(function () {
        var ev = document.getElementById('evName'); if (ev) ev.textContent = out.filter(function (x) { return norm(x.key) === 'eventname'; })[0].value;
        edSettings();
      }, function () { /* toast */ });
    };
  }

  /* ================================ BOOT ================================ */
  if (session && session.token) shell();
  else showLogin();
})();
