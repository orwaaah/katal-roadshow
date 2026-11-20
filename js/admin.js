/* KATAL Roadshow – admin dashboard */
(function () {
  'use strict';
  var LS = K.LS, api = K.api, esc = K.esc, I = K.ICONS;
  var root = document.getElementById('admin');
  var session = LS.get('adminSession', null);
  var data = null;           // last dashboard response
  var loadedAt = null;
  var f = { q: '', agent: '', list: '', date: '' };
  var timer = null;

  function brand() {
    return '<div class="brand"><div class="brand-mark">K</div><div class="brand-text"><span class="brand-name">KATAL</span><span class="brand-sub">PROPERTY</span></div></div>';
  }
  function lists() { return (data && data.lists) || ['My Leads', 'Confirmed Guests', 'Final Leads']; }
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

  /* ================================ LOGIN ================================ */
  function showLogin(msg) {
    stopTimer();
    root.innerHTML = '<div class="adm-login">' + brand() +
      '<h1 class="title">Admin dashboard</h1><p class="subtitle">Enter the Admin PIN (Settings tab of the Google Sheet).</p>' +
      '<form id="f"><input class="input" id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••••" aria-label="Admin PIN">' +
      '<div class="err" id="err">' + esc(msg || '') + '</div>' +
      '<button class="btn btn-primary btn-block" id="go">Sign in</button></form>' +
      '<p class="small muted" style="margin-top:22px">Agents use the main app: <a href="./">open the agent app</a></p></div>';
    var pin = document.getElementById('pin');
    pin.focus();
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault();
      var v = pin.value.trim();
      if (!v) return;
      var btn = document.getElementById('go');
      btn.disabled = true; btn.textContent = 'Checking…';
      api('adminLogin', { pin: v }, { timeout: 30000 }).then(function (r) {
        session = { token: r.token };
        LS.set('adminSession', session);
        load(true);
      }, function (err) {
        btn.disabled = false; btn.textContent = 'Sign in';
        document.getElementById('err').textContent = err.code === 'NETWORK' ? 'No internet connection.' : err.message;
        pin.select();
      });
    };
  }

  /* ================================ DATA ================================ */
  var loading = false;
  function load(first) {
    if (loading) return;
    loading = true;
    if (first || !data) root.innerHTML = '<div class="center-msg" style="min-height:60vh"><div><div class="spinner"></div>Loading leads…</div></div>';
    var rb = document.getElementById('refreshBtn');
    if (rb) rb.textContent = 'Refreshing…';
    api('dashboard', { token: session.token }, { timeout: 45000 }).then(function (r) {
      loading = false;
      data = r;
      loadedAt = new Date();
      LS.set('adminCache', { data: r, at: loadedAt.toISOString() });
      renderDash();
      startTimer();
    }, function (err) {
      loading = false;
      if (err.code === 'AUTH') { session = null; LS.del('adminSession'); return showLogin('Please sign in again.'); }
      if (!data) {
        var c = LS.get('adminCache', null);
        if (c) { data = c.data; loadedAt = new Date(c.at); renderDash(); K.toast('Offline — showing data from ' + fmtFull(c.at), 4000); return; }
        root.innerHTML = '<div class="adm-login">' + brand() + '<div class="notice warn" style="margin-top:30px">' + I.warn + '<div>' + esc(err.code === 'NETWORK' ? 'No internet connection.' : err.message) + '</div></div><button class="btn btn-primary btn-block" style="margin-top:14px" id="retry">Try again</button></div>';
        document.getElementById('retry').onclick = function () { load(true); };
        return;
      }
      K.toast(err.code === 'NETWORK' ? 'No internet — showing the last data' : err.message, 3500);
      var b = document.getElementById('refreshBtn');
      if (b) b.textContent = 'Refresh';
    });
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(function () { if (!document.hidden && !document.querySelector('.drawer-bg')) load(false); }, 60000);
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
  function reserveLabel() {
    var q = (data.questions || []).filter(function (x) { return /reserv/i.test(x.label + ' ' + x.text); })[0];
    return q ? (q.label || q.text) : '';
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

  /* ================================ RENDER ================================ */
  function renderDash() {
    var L = lists();
    var leads = data.leads;
    var today = dayKey(new Date().toISOString());
    var rl = reserveLabel();
    var k = { total: leads.length, today: 0, invited: 0, s2: 0, s3: 0, reserve: 0 };
    var per = {};
    (data.agents || []).forEach(function (a) { if (a.active) per[a.name] = { name: a.name, total: 0, invited: 0, s1: 0, s2: 0, s3: 0, today: 0 }; });
    leads.forEach(function (l) {
      var st = statusOf(l);
      var isToday = dayKey(l.time) === today;
      if (isToday) k.today++;
      if (l.invitedAt) k.invited++;
      if (st === 2) k.s2++;
      if (st === 3) k.s3++;
      if (rl && /^yes$/i.test(String((l.cells || {})[rl] || '').trim())) k.reserve++;
      var p = per[l.agent] || (per[l.agent] = { name: l.agent, total: 0, invited: 0, s1: 0, s2: 0, s3: 0, today: 0 });
      p.total++;
      p['s' + st]++;
      if (l.invitedAt) p.invited++;
      if (isToday) p.today++;
    });
    var agents = Object.keys(per).map(function (n) { return per[n]; }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    var maxTotal = Math.max.apply(null, agents.map(function (a) { return a.total; }).concat([1]));
    var days = {};
    leads.forEach(function (l) { var d = dayKey(l.time); if (d) days[d] = true; });
    var dayOpts = Object.keys(days).sort().reverse();
    var cnt = function (n) { return n ? n : '<span class="zero">0</span>'; };

    root.innerHTML = '<div class="adm">' +
      '<div class="adm-head"><div class="hgroup">' + brand() + '<div class="ev"><b>' + esc(data.eventName) + '</b><span id="upd">Updated ' + esc(loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + ' · auto-refresh every minute</span></div></div>' +
      '<div class="adm-actions"><button class="btn btn-ghost" id="refreshBtn">Refresh</button><button class="btn btn-primary" id="xlsBtn">Download Excel</button><button class="btn btn-quiet" id="outBtn">Log out</button></div></div>' +
      '<div class="kpis">' +
      '<div class="kpi accent"><span>Total leads</span><b>' + k.total + '</b></div>' +
      '<div class="kpi"><span>Added today</span><b>' + k.today + '</b></div>' +
      '<div class="kpi"><span>Invitations sent</span><b>' + k.invited + '</b></div>' +
      '<div class="kpi gold"><span>' + esc(L[1]) + '</span><b>' + k.s2 + '</b></div>' +
      '<div class="kpi ok"><span>' + esc(L[2]) + '</span><b>' + k.s3 + '</b></div>' +
      '<div class="kpi"><span>Reserve = Yes</span><b>' + k.reserve + '</b></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Agents</h2><span class="muted">Tap an agent to see only their leads</span></div><div class="tbl-wrap"><table class="tbl" id="agTbl"><thead><tr>' +
      '<th>Agent</th><th class="num">Leads</th><th class="num">Invited</th><th class="num">' + esc(L[0]) + '</th><th class="num">' + esc(L[1]) + '</th><th class="num">' + esc(L[2]) + '</th><th class="num">Today</th></tr></thead><tbody>' +
      agents.map(function (a) {
        return '<tr data-agent="' + esc(a.name) + '"' + (f.agent === a.name ? ' class="sel"' : '') + '><td class="nm">' + esc(a.name) + '<span class="bar" style="width:' + Math.round(60 * a.total / maxTotal) + 'px"></span></td>' +
          '<td class="num"><b>' + cnt(a.total) + '</b></td><td class="num">' + cnt(a.invited) + '</td><td class="num">' + cnt(a.s1) + '</td><td class="num">' + cnt(a.s2) + '</td><td class="num">' + cnt(a.s3) + '</td><td class="num">' + cnt(a.today) + '</td></tr>';
      }).join('') + (agents.length ? '' : '<tr><td colspan="7" class="muted">No agents yet.</td></tr>') +
      '</tbody></table></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>Leads</h2><span class="muted" id="showing"></span></div>' +
      '<div class="filters">' +
      '<input class="input" id="fq" type="search" placeholder="Search name, phone, email…" value="' + esc(f.q) + '">' +
      '<select id="fa"><option value="">All agents</option>' + agents.map(function (a) { return '<option' + (f.agent === a.name ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select>' +
      '<select id="fl"><option value="">All lists</option>' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (f.list === String(n) ? ' selected' : '') + '>' + esc(L[n - 1]) + '</option>'; }).join('') + '</select>' +
      '<select id="fd"><option value="">All dates</option>' + dayOpts.map(function (d) { return '<option value="' + d + '"' + (f.date === d ? ' selected' : '') + '>' + esc(dayLabel(d)) + '</option>'; }).join('') + '</select>' +
      '</div><div id="leadsBox"></div></div>' +
      '</div>';
    paintLeads();

    document.getElementById('refreshBtn').onclick = function () { load(false); };
    document.getElementById('xlsBtn').onclick = exportExcel;
    document.getElementById('outBtn').onclick = function () {
      K.confirmSheet({ title: 'Log out of the dashboard?', ok: 'Log out', cancel: 'Cancel' }).then(function (y) {
        if (!y) return;
        session = null; LS.del('adminSession'); LS.del('adminCache'); data = null; showLogin();
      });
    };
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
        return '<tr data-id="' + esc(l.id) + '"><td class="tm">' + esc(fmtFull(l.time)) + '</td><td>' + esc(l.agent) + '</td><td class="nm">' + esc(l.name) + '</td><td class="ph">' + esc(l.phone) + '</td><td>' + chip(l) + (l.invitedAt ? ' <span class="chip">Invited</span>' : '') + '</td>' +
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
      '<dt>Lead ID</dt><dd class="small">' + esc(l.id) + '</dd></dl></div>' +
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

  /* ================================ EXCEL ================================ */
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

  /* ================================ BOOT ================================ */
  if (session && session.token) load(true);
  else showLogin();
})();
