/* KATAL Roadshow – agent app
 * Flow: New Lead (name, phone, email) → list 1 → Confirm coming → list 2 → fill the form → list 3 (final).
 */
(function () {
  'use strict';
  var LS = K.LS, api = K.api, Outbox = K.Outbox, esc = K.esc, I = K.ICONS;
  var root = document.getElementById('app');

  var APP_LABEL = 'v1.4';
  var DEFAULT_INVITE_LINK = 'https://orwaaah.github.io/invitation-/';
  var session = LS.get('session', null);      // { token, agent, at }
  var config = LS.get('config', null);        // { eventName, countryCode, lists, invitationLink, questions, projects, units }
  var agentsCache = LS.get('agents', null);   // { eventName, agents }
  var draft = LS.get('formDraft', null);      // form in progress { leadId, agent, qs, projects, answers, skipped, hist, cur, startedAt }
  var screen = '';
  var nav = { tab: 1, q: '', leadId: '', added: '' };

  Object.assign(I, {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.1A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.3-1.2z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8A4.6 4.6 0 0111 10.6l.8-1-1-2z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1"/></svg>',
    addbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  });

  var COUNTRIES = [
    ['AE', '+971', 'United Arab Emirates'], ['SA', '+966', 'Saudi Arabia'], ['QA', '+974', 'Qatar'], ['KW', '+965', 'Kuwait'],
    ['BH', '+973', 'Bahrain'], ['OM', '+968', 'Oman'], ['EG', '+20', 'Egypt'], ['JO', '+962', 'Jordan'], ['LB', '+961', 'Lebanon'],
    ['SY', '+963', 'Syria'], ['IQ', '+964', 'Iraq'], ['PS', '+970', 'Palestine'], ['YE', '+967', 'Yemen'], ['SD', '+249', 'Sudan'],
    ['LY', '+218', 'Libya'], ['TN', '+216', 'Tunisia'], ['DZ', '+213', 'Algeria'], ['MA', '+212', 'Morocco'], ['TR', '+90', 'Turkey'],
    ['IR', '+98', 'Iran'], ['GB', '+44', 'United Kingdom'], ['IN', '+91', 'India'], ['PK', '+92', 'Pakistan'], ['BD', '+880', 'Bangladesh'],
    ['LK', '+94', 'Sri Lanka'], ['NP', '+977', 'Nepal'], ['AF', '+93', 'Afghanistan'], ['RU', '+7', 'Russia'], ['KZ', '+7', 'Kazakhstan'],
    ['UA', '+380', 'Ukraine'], ['CN', '+86', 'China'], ['HK', '+852', 'Hong Kong'], ['SG', '+65', 'Singapore'], ['MY', '+60', 'Malaysia'],
    ['ID', '+62', 'Indonesia'], ['PH', '+63', 'Philippines'], ['TH', '+66', 'Thailand'], ['VN', '+84', 'Vietnam'], ['JP', '+81', 'Japan'],
    ['KR', '+82', 'South Korea'], ['AU', '+61', 'Australia'], ['NZ', '+64', 'New Zealand'], ['US', '+1', 'United States'], ['CA', '+1', 'Canada'],
    ['MX', '+52', 'Mexico'], ['BR', '+55', 'Brazil'], ['AR', '+54', 'Argentina'], ['DE', '+49', 'Germany'], ['FR', '+33', 'France'],
    ['IT', '+39', 'Italy'], ['ES', '+34', 'Spain'], ['PT', '+351', 'Portugal'], ['NL', '+31', 'Netherlands'], ['BE', '+32', 'Belgium'],
    ['CH', '+41', 'Switzerland'], ['AT', '+43', 'Austria'], ['IE', '+353', 'Ireland'], ['SE', '+46', 'Sweden'], ['NO', '+47', 'Norway'],
    ['DK', '+45', 'Denmark'], ['FI', '+358', 'Finland'], ['PL', '+48', 'Poland'], ['CZ', '+420', 'Czechia'], ['RO', '+40', 'Romania'],
    ['GR', '+30', 'Greece'], ['CY', '+357', 'Cyprus'], ['HU', '+36', 'Hungary'], ['BG', '+359', 'Bulgaria'], ['RS', '+381', 'Serbia'],
    ['AZ', '+994', 'Azerbaijan'], ['AM', '+374', 'Armenia'], ['GE', '+995', 'Georgia'], ['UZ', '+998', 'Uzbekistan'], ['ZA', '+27', 'South Africa'],
    ['NG', '+234', 'Nigeria'], ['KE', '+254', 'Kenya'], ['ET', '+251', 'Ethiopia'], ['GH', '+233', 'Ghana'], ['TZ', '+255', 'Tanzania']
  ];
  function flag(iso) {
    return iso.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); });
  }

  function render(html) {
    root.oninput = null; root.onchange = null; root.onkeydown = null; root.onclick = null;
    root.innerHTML = html;
    window.scrollTo(0, 0);
  }
  function brand() {
    return '<div class="brand"><div class="brand-mark">K</div><div class="brand-text"><span class="brand-name">KATAL</span><span class="brand-sub">PROPERTY</span></div></div>';
  }
  function eventName() { return (config && config.eventName) || (agentsCache && agentsCache.eventName) || 'Roadshow'; }
  function listName(n) {
    var d = ['My Leads', 'Confirmed Guests', 'Final Leads'];
    return (config && config.lists && config.lists[n - 1]) || d[n - 1];
  }
  function saveDraft() { if (draft) LS.set('formDraft', draft); else LS.del('formDraft'); }
  function nowIso() { return new Date().toISOString(); }
  function topbar(back, right) {
    return '<div class="topbar">' + (back ? '<button class="icon-btn" data-act="' + back + '" aria-label="Back">' + I.back + '</button>' : brand()) +
      (back ? brand() : '') + (right != null ? right : '<span style="width:48px"></span>') + '</div>';
  }

  /* =============================== SYNC UI =============================== */
  function pillHtml() {
    var s = K.status();
    var cls = '', txt = 'All synced';
    if (s.offline) { cls = 'is-offline'; txt = s.pending ? 'Offline · ' + s.pending + ' pending' : 'Offline'; }
    else if (s.pending && s.syncing) { cls = 'is-pending'; txt = 'Syncing ' + s.pending + '…'; }
    else if (s.pending && s.error) { cls = 'is-error'; txt = s.pending + ' pending sync'; }
    else if (s.pending) { cls = 'is-pending'; txt = s.pending + ' pending sync'; }
    return '<button class="pill ' + cls + '" data-act="sync"><span class="dot"></span>' + esc(txt) + '</button>';
  }
  function refreshSyncUi() {
    var p = document.getElementById('syncPill');
    if (p) p.innerHTML = pillHtml();
    Array.prototype.forEach.call(document.querySelectorAll('[data-pending-for]'), function (el) {
      el.hidden = !pendingIds()[el.getAttribute('data-pending-for')];
    });
  }
  K.on('sync', refreshSyncUi);
  K.on('outbox', refreshSyncUi);
  K.on('synced', refreshSyncUi);

  function manualSync() {
    var s = K.status();
    if (s.offline) return K.toast('You are offline. Everything will sync when internet is back.');
    if (!s.pending) { refreshLeads(); return K.toast('Everything is synced ✓'); }
    K.toast('Syncing…');
    K.sync().then(function () {
      var st = K.status();
      K.toast(st.pending ? (st.error || 'Still pending — will retry automatically') : 'All synced ✓');
    });
  }

  /* ================================ LEADS STORE ================================ */
  function leadsKey() { return 'leads.' + String(session && session.agent || '').toLowerCase(); }
  function allLeads() { return LS.get(leadsKey(), []); }
  function saveLeads(list) { LS.set(leadsKey(), list); }
  function getLead(id) { return allLeads().filter(function (l) { return l.id === id; })[0] || null; }
  function putLead(lead) {
    var list = allLeads(), found = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === lead.id) { list[i] = lead; found = true; }
    if (!found) list.push(lead);
    saveLeads(list);
  }
  function statusOf(l) { return l.formAt ? 3 : l.confirmedAt ? 2 : 1; }
  function pendingIds() {
    var ids = {};
    Outbox.list().forEach(function (o) {
      if (o.action === 'saveLead') ids[o.data.lead.id] = true;
      else if (o.data && o.data.leadId) ids[o.data.leadId] = true;
    });
    return ids;
  }
  function createLead(lead) {
    putLead(lead);
    Outbox.add('saveLead', { lead: { id: lead.id, createdAt: lead.createdAt, name: lead.name, phone: lead.phone, email: lead.email, device: String(navigator.userAgent || '').slice(0, 160) } }, session.token, session.agent);
    K.sync();
  }
  function patchLead(id, patch) {
    var l = getLead(id);
    if (!l) return null;
    Object.keys(patch).forEach(function (k) { l[k] = patch[k]; });
    putLead(l);
    Outbox.add('updateLead', { leadId: id, patch: patch }, session.token, session.agent);
    K.sync();
    return l;
  }
  function addNote(id, text) {
    var l = getLead(id);
    if (!l) return;
    var note = { id: K.uid('N'), time: nowIso(), agent: session.agent, text: text };
    l.notes = (l.notes || []).concat([note]);
    putLead(l);
    Outbox.add('addNote', { noteId: note.id, leadId: id, text: text, createdAt: note.time }, session.token, session.agent);
    K.sync();
  }

  var leadsPromise = null;
  function refreshLeads() {
    if (!session) return Promise.resolve();
    if (leadsPromise) return leadsPromise;
    leadsPromise = api('myLeads', { token: session.token }, { timeout: 25000 }).then(function (r) {
      leadsPromise = null;
      var pend = pendingIds();
      var local = allLeads();
      var byId = {};
      local.forEach(function (l) { byId[l.id] = l; });
      var seen = {};
      var out = (r.leads || []).map(function (s) {
        seen[s.id] = true;
        if (pend[s.id] && byId[s.id]) return byId[s.id];
        return {
          id: s.id, agent: s.agent, name: s.name, phone: s.phone, email: s.email || '', createdAt: s.time,
          invitedAt: s.invitedAt || '', confirmedAt: s.confirmedAt || '', formAt: s.formAt || '',
          answers: s.answers || [], liked: s.liked || [], notes: s.notes || []
        };
      });
      local.forEach(function (l) { if (!seen[l.id] && pend[l.id]) out.push(l); });
      saveLeads(out);
      K.emit('leads');
      return out;
    }, function (err) {
      leadsPromise = null;
      if (err.code === 'AUTH') forceLogout('Your PIN or name was changed. Please sign in again.');
      else if (screen === 'lists') paintList();
      throw err;
    });
    return leadsPromise;
  }
  K.on('synced', function (op) {
    // after the last pending op is sent, pull the fresh server copy
    if (!Outbox.count()) refreshLeads().catch(function () { /* ignore */ });
  });

  /* ================================ LOGIN ================================ */
  function showLogin(msg) {
    screen = 'login';
    render('<section class="screen">' +
      '<div class="topbar">' + brand() + '</div>' +
      '<div class="login-head"><div class="eyebrow">' + esc(eventName()) + '</div>' +
      '<h1 class="title">Welcome.<br>Who is capturing leads?</h1>' +
      '<p class="subtitle">Tap your name to sign in.</p></div>' +
      (msg ? '<div class="notice info">' + esc(msg) + '</div>' : '') +
      '<div class="agent-list" id="agentList">' + agentListHtml() + '</div>' +
      installBtnHtml() +
      '<div class="home-foot"><span>' + APP_LABEL + '</span>' + (LS.get('adminSession', null) ? '<a class="link" href="admin.html">Dashboard</a>' : '<span></span>') + '</div>' +
      '</section>');
    root.onclick = function (e) {
      var b = e.target.closest('[data-agent]');
      if (b) return showPin(b.getAttribute('data-agent'));
      if (e.target.closest('[data-act="retry"]')) return loadAgents(true);
    };
    loadAgents(false);
  }
  function agentListHtml(errMsg) {
    if (errMsg) {
      return '<div class="notice warn">' + I.warn + '<div>' + esc(errMsg) + '</div></div>' +
        '<button class="btn btn-ghost btn-block" data-act="retry">Try again</button>';
    }
    if (!agentsCache || !agentsCache.agents) return '<div class="center-msg"><div><div class="spinner"></div>Loading agents…</div></div>';
    if (!agentsCache.agents.length) return '<div class="notice info">No agents yet. Please contact your manager.</div>';
    return agentsCache.agents.map(function (n) {
      return '<button class="agent-btn" data-agent="' + esc(n) + '"><span class="avatar">' + esc(K.initials(n)) + '</span>' + esc(n) + '<span class="chev">' + I.chev + '</span></button>';
    }).join('');
  }
  function loadAgents(showSpinner) {
    var list = document.getElementById('agentList');
    if (showSpinner && list) list.innerHTML = agentListHtml();
    api('agents', {}, { timeout: 25000 }).then(function (r) {
      agentsCache = { eventName: r.eventName, agents: r.agents };
      LS.set('agents', agentsCache);
      if (screen === 'login') {
        var l = document.getElementById('agentList');
        if (l) l.innerHTML = agentListHtml();
        var eb = root.querySelector('.eyebrow');
        if (eb) eb.textContent = eventName();
      }
    }, function (err) {
      if (screen !== 'login') return;
      var l = document.getElementById('agentList');
      if (!l) return;
      if (agentsCache && agentsCache.agents && err.code === 'NETWORK') return;
      l.innerHTML = agentListHtml(err.code === 'NETWORK' ? 'No internet connection. Connect to Wi-Fi or mobile data to sign in.' : err.message);
    });
  }

  function showPin(name) {
    screen = 'pin';
    var pin = '', busy = false;
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    render('<section class="screen">' +
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">' + I.back + '</button>' + brand() + '<span style="width:48px"></span></div>' +
      '<div class="pin-wrap">' +
      '<div class="avatar" style="width:66px;height:66px;font-size:22px;margin-top:22px">' + esc(K.initials(name)) + '</div>' +
      '<h2 class="title" style="font-size:30px;text-align:center;margin-top:14px">' + esc(name) + '</h2>' +
      '<p class="subtitle" style="margin-top:4px">Enter your 4-digit PIN</p>' +
      '<div class="pin-dots" id="dots"><span></span><span></span><span></span><span></span></div>' +
      '<div class="pin-msg" id="pinMsg"></div>' +
      '<div class="keypad">' + keys.map(function (k) {
        if (k === '') return '<span></span>';
        if (k === 'del') return '<button class="key key-plain" data-key="del" aria-label="Delete">' + I.del + '</button>';
        return '<button class="key" data-key="' + k + '">' + k + '</button>';
      }).join('') + '</div>' +
      '</div></section>');
    var dots = document.getElementById('dots');
    var msg = document.getElementById('pinMsg');
    function paint() { Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i < pin.length); }); }
    function press(k) {
      if (busy) return;
      if (k === 'del') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      msg.textContent = '';
      msg.style.color = '';
      paint();
      if (pin.length === 4) submit();
    }
    function submit() {
      busy = true;
      msg.style.color = 'var(--muted)';
      msg.textContent = 'Checking…';
      api('login', { name: name, pin: pin }, { timeout: 25000 }).then(function (r) {
        session = { token: r.token, agent: r.agent, at: nowIso() };
        LS.set('session', session);
        document.removeEventListener('keydown', onKey);
        refreshConfig().catch(function () { /* handled on home */ });
        refreshLeads().catch(function () { /* offline */ });
        goHome();
        K.toast('Welcome, ' + r.agent.split(' ')[0]);
        K.sync();
      }, function (err) {
        busy = false;
        pin = '';
        paint();
        msg.style.color = '';
        if (err.code === 'BAD_PIN') {
          msg.textContent = 'Wrong PIN. Try again.';
          dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
          if (navigator.vibrate) navigator.vibrate(120);
        } else if (err.code === 'NETWORK') msg.textContent = 'No internet. Connect and try again.';
        else msg.textContent = err.message;
      });
    }
    function onKey(e) {
      if (screen !== 'pin') { document.removeEventListener('keydown', onKey); return; }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    }
    document.addEventListener('keydown', onKey);
    root.onclick = function (e) {
      var k = e.target.closest('[data-key]');
      if (k) return press(k.getAttribute('data-key'));
      if (e.target.closest('[data-act="back"]')) { document.removeEventListener('keydown', onKey); showLogin(); }
    };
  }

  function logout() {
    var n = Outbox.count();
    K.confirmSheet({
      title: 'Log out?',
      text: 'You will need your PIN to sign in again.',
      ok: 'Log out', cancel: 'Stay signed in'
    }).then(function (yes) {
      if (!yes) return;
      session = null; draft = null;
      LS.del('session'); saveDraft();
      showLogin();
    });
  }
  function forceLogout(msg) {
    if (session && session.isAdmin) { LS.del('session'); location.href = 'admin.html'; return; }
    session = null;
    LS.del('session');
    showLogin(msg);
  }

  /* ================================ CONFIG ================================ */
  var configPromise = null;
  function refreshConfig() {
    if (!session) return Promise.reject(new K.ApiError('Not signed in', 'AUTH'));
    if (configPromise) return configPromise;
    configPromise = api('config', { token: session.token }, { timeout: 30000 }).then(function (r) {
      config = {
        eventName: r.eventName, countryCode: r.countryCode || '+971', lists: r.lists, invitationLink: r.invitationLink || '',
        questions: r.questions || [], projects: r.projects || [], units: r.units || [], fetchedAt: nowIso()
      };
      LS.set('config', config);
      configPromise = null;
      if (screen === 'home') goHome();
      return config;
    }, function (err) {
      configPromise = null;
      if (err.code === 'AUTH') forceLogout('Your PIN or name was changed. Please sign in again.');
      throw err;
    });
    return configPromise;
  }

  /* ================================= HOME ================================= */
  function counts() {
    var c = { 1: 0, 2: 0, 3: 0, today: 0, invited: 0 };
    var today = new Date().toDateString();
    allLeads().forEach(function (l) {
      c[statusOf(l)]++;
      if (l.invitedAt) c.invited++;
      if (new Date(l.createdAt).toDateString() === today) c.today++;
    });
    return c;
  }

  function goHome() {
    screen = 'home';
    var c = counts();
    var dl = draft && K.sameName(draft.agent, session.agent) ? getLead(draft.leadId) : null;
    var tile = function (n, icon) {
      return '<button class="list-tile" data-tab="' + n + '"><span class="ic">' + icon + '</span><span class="lt-name">' + esc(listName(n)) + '</span><b>' + c[n] + '</b><span class="chev">' + I.chev + '</span></button>';
    };
    var adminBtn = session.isAdmin ? '<a class="switch-pill" href="admin.html">' + I.swap + 'Dashboard</a>' : null;
    render('<section class="screen">' +
      topbar(null, adminBtn) +
      '<div class="home-hero"><div class="eyebrow">' + esc(eventName()) + '</div><h1 class="title">Hello, ' + esc(session.agent) + '</h1></div>' +
      (dl ? '<button class="card-btn is-resume" data-act="resume" style="margin:0 0 12px"><span class="ic">' + I.resume + '</span><span><span class="t">Continue form: ' + esc(dl.name) + '</span><br><span class="s">Started ' + esc(K.fmtTime(draft.startedAt)) + ' · not saved yet</span></span><span class="chev">' + I.chev + '</span></button>' : '') +
      '<button class="cta-card" data-act="new"><span class="cta-icon">' + I.plus + '</span><span><span class="cta-title">New Lead</span><br><span class="cta-sub">Name & phone number</span></span></button>' +
      '<button class="search-fake" data-act="search">' + I.search + '<span>Search by name or phone</span></button>' +
      '<div class="tiles">' + tile(1, I.users) + tile(2, I.check) + tile(3, I.star) + '</div>' +
      installBtnHtml() +
      '<div class="home-foot"><span>' + c.today + ' added today · ' + APP_LABEL + '</span>' +
      (session.isAdmin ? '<a class="link" href="admin.html">Back to dashboard</a>' : '<button class="link" data-act="logout">Log out</button>') + '</div>' +
      '</section>');
    root.onclick = function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { nav.tab = Number(t.getAttribute('data-tab')); nav.q = ''; return showLists(); }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'new') showAdd();
      else if (act === 'search') { nav.q = ''; showLists(true); }
      else if (act === 'resume') renderStep();
      else if (act === 'logout') logout();
      else if (act === 'sync') manualSync();
    };
  }
  K.on('leads', function () {
    if (screen === 'home') goHome();
    else if (screen === 'lists') paintList();
    else if (screen === 'lead' && nav.leadId && getLead(nav.leadId)) { /* keep the page stable; refresh header chips only */ refreshSyncUi(); }
  });

  /* ============================ ADD / EDIT LEAD ============================ */
  function ccDefaultValue(code) {
    code = code || (config && config.countryCode) || '+971';
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i][1] === code) return COUNTRIES[i][1] + '|' + COUNTRIES[i][0];
    return '+971|AE';
  }
  function ccFace(v) {
    var p = String(v).split('|');
    return flag(p[1] || 'AE') + ' ' + esc(p[0]);
  }
  function buildPhone(raw, ccVal) {
    raw = String(raw || '').trim();
    var code = String(ccVal || ccDefaultValue()).split('|')[0];
    if (/^(\+|00)/.test(raw)) return '+' + K.digits(raw).replace(/^00/, '');
    var d = K.digits(raw).replace(/^0+/, '');
    var cd = K.digits(code);
    if (d.indexOf(cd) === 0 && d.length >= cd.length + 8) d = d.slice(cd.length);
    return code + d;
  }
  function splitPhone(full) {
    // best-effort: find the longest country code that matches the start of the number
    var d = K.digits(full), best = null;
    COUNTRIES.forEach(function (c) {
      var cd = K.digits(c[1]);
      if (d.indexOf(cd) === 0 && (!best || cd.length > K.digits(best[1]).length)) best = c;
    });
    if (!best) return { cc: ccDefaultValue(), num: d };
    return { cc: best[1] + '|' + best[0], num: d.slice(K.digits(best[1]).length) };
  }

  function showAdd(editId) {
    screen = 'add';
    var edit = editId ? getLead(editId) : null;
    var parts = edit ? splitPhone(edit.phone) : { cc: ccDefaultValue(), num: '' };
    var cc = parts.cc;
    var opts = COUNTRIES.map(function (x) {
      var v = x[1] + '|' + x[0];
      return '<option value="' + v + '"' + (v === cc ? ' selected' : '') + '>' + flag(x[0]) + ' ' + x[2] + ' (' + x[1] + ')</option>';
    }).join('');
    render('<section class="screen flow">' +
      '<div class="topbar"><button class="icon-btn" data-act="cancel" aria-label="Back">' + I.back + '</button>' + brand() + '<span style="width:48px"></span></div>' +
      '<div class="q-head"><div class="eyebrow">' + (edit ? 'Edit details' : 'New lead') + '</div><h1 class="q-text">' + (edit ? esc(edit.name) : 'Who is the client?') + '</h1></div>' +
      '<div class="q-body" style="gap:18px">' +
      '<div class="field"><label for="cName">Client name</label><input class="input" id="cName" type="text" autocomplete="off" autocapitalize="words" placeholder="Full name" value="' + esc(edit ? edit.name : '') + '"></div>' +
      '<div class="field"><label for="cPhone">Phone number</label><div class="phone-row">' +
      '<div class="cc"><div class="cc-face"><span id="ccFace">' + ccFace(cc) + '</span><span class="caret">▼</span></div><select id="cc" aria-label="Country code">' + opts + '</select></div>' +
      '<input class="input" id="cPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="50 123 4567" value="' + esc(parts.num) + '"></div></div>' +
      '<div class="field"><label for="cEmail">Email <span class="muted" style="font-weight:500">(optional)</span></label><input class="input" id="cEmail" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="name@email.com" value="' + esc(edit ? edit.email : '') + '"></div>' +
      '<div id="dupWarn"></div>' +
      '<div class="err" id="cErr"></div>' +
      '</div>' +
      '<div class="action-bar"><button class="btn btn-primary" data-act="save" id="saveBtn">' + (edit ? 'Save changes' : 'Save lead') + '</button></div>' +
      '</section>');
    var dupTimer = null, dupSeq = 0;
    function val(id) { return document.getElementById(id).value; }
    function checkDup() {
      if (screen !== 'add') return;
      var full = buildPhone(val('cPhone'), val('cc'));
      var warnEl = document.getElementById('dupWarn');
      var d = K.digits(full);
      if (d.length < 8) { warnEl.innerHTML = ''; return; }
      var local = allLeads().some(function (l) { return K.digits(l.phone) === d && (!edit || l.id !== edit.id); });
      if (local) showDup('This number is already in your leads.');
      else warnEl.innerHTML = '';
      var seq = ++dupSeq;
      api('checkPhone', { token: session.token, phone: full }, { timeout: 8000 }).then(function (r) {
        if (seq !== dupSeq || screen !== 'add') return;
        if (r.exists && !(edit && r.count === 1 && r.mine)) showDup(r.mine ? 'This number is already in your leads.' : 'This number was already registered by another agent.');
        else if (!local) document.getElementById('dupWarn').innerHTML = '';
      }, function () { /* offline: local check only */ });
    }
    function showDup(text) {
      document.getElementById('dupWarn').innerHTML = '<div class="notice warn">' + I.warn + '<div><b>Phone already exists.</b> ' + esc(text) + ' You can still save.</div></div>';
    }
    root.oninput = function (e) {
      document.getElementById('cErr').textContent = '';
      if (e.target.id === 'cPhone') { clearTimeout(dupTimer); dupTimer = setTimeout(checkDup, 650); }
    };
    root.onchange = function (e) {
      if (e.target.id === 'cc') {
        document.getElementById('ccFace').innerHTML = ccFace(e.target.value);
        clearTimeout(dupTimer); dupTimer = setTimeout(checkDup, 300);
      }
    };
    root.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'cName') { e.preventDefault(); document.getElementById('cPhone').focus(); }
      else if (e.target.id === 'cPhone') { e.preventDefault(); document.getElementById('cEmail').focus(); }
      else if (e.target.id === 'cEmail') { e.preventDefault(); save(); }
    };
    root.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'cancel') return edit ? showLead(edit.id) : goHome();
      if (act === 'save') save();
    };
    function save() {
      if (screen !== 'add') return;
      var err = document.getElementById('cErr');
      var name = val('cName').trim().replace(/\s+/g, ' ');
      var raw = K.digits(val('cPhone'));
      var email = val('cEmail').trim();
      if (name.length < 2) { err.textContent = 'Please enter the client name.'; document.getElementById('cName').focus(); return; }
      if (raw.replace(/^0+/, '').length < 6) { err.textContent = 'Please enter a valid phone number.'; document.getElementById('cPhone').focus(); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'This email looks wrong. Fix it or leave it empty.'; document.getElementById('cEmail').focus(); return; }
      var phone = buildPhone(val('cPhone'), val('cc'));
      if (edit) {
        patchLead(edit.id, { name: name, phone: phone, email: email });
        K.toast('Saved ✓');
        return showLead(edit.id);
      }
      var lead = {
        id: K.uid('L'), agent: session.agent, name: name, phone: phone, email: email, createdAt: nowIso(),
        invitedAt: '', confirmedAt: '', formAt: '', answers: [], liked: [], notes: []
      };
      createLead(lead);
      showAdded(lead.id);
    }
    if (!edit) setTimeout(function () {
      var n = document.getElementById('cName');
      var a = document.activeElement;
      if (n && (!a || a === document.body)) n.focus();
    }, 60);
  }

  function showAdded(id) {
    screen = 'added';
    nav.added = id;
    var l = getLead(id);
    render('<section class="screen">' + topbar() +
      '<div class="done-wrap">' +
      '<div class="done-badge">' + I.check + '</div>' +
      '<h1 class="title">Lead added</h1>' +
      '<p class="subtitle">' + esc(l.name) + ' · ' + esc(l.phone) + '</p>' +
      '<p class="subtitle small">Added to <b>' + esc(listName(1)) + '</b></p>' +
      '</div>' +
      '<div class="action-bar" style="flex-direction:column">' +
      '<button class="btn btn-gold btn-block" data-act="invite">' + I.send + ' Send invitation</button>' +
      '<button class="btn btn-primary btn-block" data-act="another">' + I.plus + ' Add another lead</button>' +
      '<div class="btn-trio">' +
      '<button class="btn btn-ghost" data-act="open">' + I.users + '<span>Open lead</span></button>' +
      '<button class="btn btn-ghost" data-act="form">' + I.form + '<span>Fill the form</span></button>' +
      '<button class="btn btn-ghost" data-act="home">' + I.home + '<span>Home</span></button>' +
      '</div></div></section>');
    root.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'invite') { sendInvite(id); var b = a; b.innerHTML = I.check + ' Invitation opened'; b.classList.remove('btn-gold'); b.classList.add('btn-ghost'); }
      else if (act === 'another') showAdd();
      else if (act === 'open') showLead(id);
      else if (act === 'form') startForm(id);
      else if (act === 'home') goHome();
      else if (act === 'sync') manualSync();
    };
  }

  /* ============================== INVITATION ============================== */
  function sendInvite(id) {
    var l = getLead(id);
    if (!l) return;
    var link = (config && config.invitationLink) || DEFAULT_INVITE_LINK;
    link = link.replace(/\{name\}/g, encodeURIComponent(l.name)).replace(/\{phone\}/g, encodeURIComponent(l.phone))
      .replace(/\{agent\}/g, encodeURIComponent(session.agent));
    try { if (navigator.clipboard) navigator.clipboard.writeText(l.name).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    window.open(link, '_blank');
    if (!l.invitedAt) patchLead(id, { invitedAt: nowIso() });
    K.toast('Client name copied — paste it in the invitation', 3500);
  }

  /* ================================= LISTS ================================= */
  function showLists(focusSearch) {
    screen = 'lists';
    render('<section class="screen lists">' +
      '<div class="topbar"><button class="icon-btn" data-act="home" aria-label="Home">' + I.back + '</button>' + brand() + '<span style="width:48px"></span></div>' +
      '<div class="search-box">' + I.search + '<input id="q" type="text" inputmode="search" enterkeyhint="search" placeholder="Search by name or phone" autocomplete="off" value="' + esc(nav.q) + '"><button class="clear" data-act="clear" aria-label="Clear search"' + (nav.q ? '' : ' hidden') + '>' + I.close + '</button></div>' +
      '<div class="seg" id="seg"></div>' +
      '<div id="listBody" class="lead-list"></div>' +
      '<button class="fab" data-act="new" aria-label="New lead">' + I.plus + '</button>' +
      '</section>');
    paintList();
    root.oninput = function (e) {
      if (e.target.id === 'q') { nav.q = e.target.value; paintList(); }
    };
    root.onclick = function (e) {
      var b = e.target.closest('[data-row-act]');
      if (b) {
        var id = b.getAttribute('data-id');
        var act = b.getAttribute('data-row-act');
        if (act === 'invite') { sendInvite(id); paintList(); }
        else if (act === 'form') startForm(id);
        return;
      }
      var row = e.target.closest('[data-lead]');
      if (row) return showLead(row.getAttribute('data-lead'));
      var t = e.target.closest('[data-tab]');
      if (t) { nav.tab = Number(t.getAttribute('data-tab')); paintList(); return; }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act2 = a.getAttribute('data-act');
      if (act2 === 'home') goHome();
      else if (act2 === 'new') showAdd();
      else if (act2 === 'sync') manualSync();
      else if (act2 === 'clear') { nav.q = ''; document.getElementById('q').value = ''; paintList(); }
    };
    if (focusSearch) setTimeout(function () { var q = document.getElementById('q'); if (q) q.focus(); }, 60);
    refreshLeads().catch(function () { /* offline: local copy */ });
  }

  function paintList() {
    var body = document.getElementById('listBody');
    var seg = document.getElementById('seg');
    if (!body || !seg) return;
    var leads = allLeads();
    var c = { 1: 0, 2: 0, 3: 0 };
    leads.forEach(function (l) { c[statusOf(l)]++; });
    var q = String(nav.q || '').trim().toLowerCase();
    seg.hidden = !!q;
    var clr = root.querySelector('.search-box .clear');
    if (clr) clr.hidden = !nav.q;
    seg.innerHTML = [1, 2, 3].map(function (n) {
      return '<button class="seg-btn' + (nav.tab === n ? ' on' : '') + '" data-tab="' + n + '"><span>' + esc(listName(n)) + '</span><b>' + c[n] + '</b></button>';
    }).join('');
    var rows;
    if (q) {
      var qd = K.digits(q);
      rows = leads.filter(function (l) {
        return String(l.name).toLowerCase().indexOf(q) >= 0 || (qd.length >= 3 && K.digits(l.phone).indexOf(qd) >= 0);
      }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    } else {
      rows = leads.filter(function (l) { return statusOf(l) === nav.tab; });
      if (nav.tab === 2) rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      else rows.sort(function (a, b) { return String((nav.tab === 3 ? b.formAt : b.createdAt) || '').localeCompare(String((nav.tab === 3 ? a.formAt : a.createdAt) || '')); });
    }
    if (!rows.length) {
      if (!leads.length && leadsPromise) { body.innerHTML = '<div class="center-msg"><div><div class="spinner"></div>Loading…</div></div>'; return; }
      body.innerHTML = '<div class="empty">' + (q ? 'No lead matches “' + esc(nav.q) + '”.' : emptyText(nav.tab)) + '</div>';
      return;
    }
    var pend = pendingIds();
    body.innerHTML = (q ? '<div class="list-note">' + rows.length + ' result' + (rows.length > 1 ? 's' : '') + ' in all lists</div>' : '') + rows.map(function (l) { return rowHtml(l, !!q, pend); }).join('');
  }
  function emptyText(n) {
    if (n === 1) return 'No leads yet. Tap <b>+</b> to add the first one.';
    if (n === 2) return 'Nobody confirmed yet. Open a lead in “' + esc(listName(1)) + '” and tap <b>Confirm coming</b>.';
    return 'No forms filled yet. Open a lead in “' + esc(listName(2)) + '” and tap <b>Start form</b>.';
  }
  function rowHtml(l, showStatus, pend) {
    var st = statusOf(l);
    var sub = esc(l.phone);
    var right = '';
    if (st === 1) right = l.invitedAt
      ? '<button class="mini is-done" data-row-act="invite" data-id="' + esc(l.id) + '">' + I.check + 'Invited</button>'
      : '<button class="mini is-gold" data-row-act="invite" data-id="' + esc(l.id) + '">' + I.send + 'Invite</button>';
    else if (st === 2) right = '<button class="mini is-navy" data-row-act="form" data-id="' + esc(l.id) + '">' + I.form + 'Start form</button>';
    else right = '<span class="chev">' + I.chev + '</span>';
    var chips = '';
    if (showStatus) chips += '<span class="chip s' + st + '">' + esc(listName(st)) + '</span>';
    if (st === 3) {
      var summary = leadSummary(l);
      if (summary) sub += ' · ' + esc(summary);
    }
    return '<div class="lead-row" data-lead="' + esc(l.id) + '">' +
      '<span class="avatar">' + esc(K.initials(l.name)) + '</span>' +
      '<span class="lr-main"><span class="lr-name">' + esc(l.name) + '</span><span class="lr-sub">' + sub + '</span>' + (chips ? '<span class="lr-chips">' + chips + '</span>' : '') + '</span>' +
      right + '</div>';
  }
  function leadSummary(l) {
    var parts = [];
    (l.answers || []).forEach(function (a) {
      if (a.skipped || a.value == null) return;
      if (a.match === 'unitType' || a.match === 'propertyType' || a.match === 'budget') parts.push(answerText(a));
    });
    return parts.slice(0, 3).join(' · ');
  }

  /* ============================== LEAD DETAIL ============================== */
  function showLead(id) {
    var l = getLead(id);
    if (!l) { K.toast('Lead not found'); return showLists(); }
    screen = 'lead';
    nav.leadId = id;
    var st = statusOf(l);
    var digits = K.digits(l.phone);
    var tl = function (label, iso) {
      return '<span class="tl' + (iso ? ' on' : '') + '">' + (iso ? I.check : '') + esc(label) + (iso ? ' <i>' + esc(K.fmtTime(iso)) + '</i>' : '') + '</span>';
    };
    var main = '';
    if (st === 1) main = '<button class="btn btn-primary btn-block" data-act="confirm">' + I.check + ' Confirm coming</button>' +
      '<button class="btn btn-ghost btn-block" data-act="form" style="margin-top:10px">' + I.form + ' Fill the form now</button>';
    else if (st === 2) main = '<button class="btn btn-primary btn-block" data-act="form">' + I.form + ' Start form</button>' +
      '<div class="row-links"><button class="link" data-act="unconfirm">Undo confirmation</button></div>';
    else main = '<button class="btn btn-ghost btn-block" data-act="form">' + I.edit + ' Edit answers</button>';

    var answersHtml = '';
    if (l.formAt && (l.answers || []).length) {
      answersHtml = '<div class="section"><h3>Answers</h3><dl class="answers">' + l.answers.map(function (a) {
        return '<div><dt>' + esc(a.label || a.question) + '</dt><dd>' + esc(a.skipped ? 'Skipped' : answerText(a) || '—') + '</dd></div>';
      }).join('') + '</dl></div>';
    }
    var unitsHtml = l.formAt ? '<div class="section"><h3 id="unitsTitle">Matching units</h3><div id="units"></div></div>' : '';
    var notes = (l.notes || []).slice().reverse();
    var notesHtml = '<div class="section"><h3>Notes</h3>' +
      '<div class="note-add"><textarea class="input" id="noteText" rows="2" placeholder="Write a note…"></textarea><button class="btn btn-primary btn-sm" data-act="note">Add note</button></div>' +
      (notes.length ? '<ul class="notes">' + notes.map(function (n) {
        return '<li><p>' + esc(n.text) + '</p><span>' + esc(K.fmtTime(n.time)) + (n.agent ? ' · ' + esc(n.agent) : '') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted small" style="margin:10px 2px 0">No notes yet.</p>') + '</div>';

    render('<section class="screen">' +
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">' + I.back + '</button>' + brand() + '<span style="width:48px"></span></div>' +
      '<div class="lead-head">' +
      '<span class="chip s' + st + '">' + esc(listName(st)) + '</span>' +
      '<h1 class="title">' + esc(l.name) + '</h1>' +
      '<p class="subtitle">' + esc(l.phone) + (l.email ? '<br>' + esc(l.email) : '') + '</p>' +
      '<div class="timeline">' + tl('Added', l.createdAt) + tl('Invited', l.invitedAt) + tl('Confirmed', l.confirmedAt) + tl('Form', l.formAt) + '</div>' +
      '</div>' +
      '<div class="quick">' +
      '<a class="q-btn" href="tel:+' + esc(digits) + '">' + I.phone + '<span>Call</span></a>' +
      '<a class="q-btn" href="https://wa.me/' + esc(digits) + '" target="_blank" rel="noopener">' + I.wa + '<span>WhatsApp</span></a>' +
      '<button class="q-btn' + (l.invitedAt ? ' done' : '') + '" data-act="invite">' + I.send + '<span>' + (l.invitedAt ? 'Invited ✓' : 'Invite') + '</span></button>' +
      '</div>' +
      '<div class="main-act">' + main + '</div>' +
      answersHtml + unitsHtml + notesHtml +
      '<div class="row-links" style="margin-top:18px"><button class="link" data-act="edit">Edit name / phone / email</button></div>' +
      '</section>');
    if (l.formAt) paintUnits(l);
    root.onclick = function (e) {
      var u = e.target.closest('[data-unit]');
      if (u) return toggleLiked(id, u.getAttribute('data-unit'), u);
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'back') showLists();
      else if (act === 'sync') manualSync();
      else if (act === 'invite') { sendInvite(id); showLead(id); }
      else if (act === 'confirm') {
        patchLead(id, { confirmedAt: nowIso() });
        nav.tab = 2;
        K.toast('Moved to ' + listName(2) + ' ✓');
        showLead(id);
      } else if (act === 'unconfirm') {
        K.confirmSheet({ title: 'Undo confirmation?', text: 'The lead goes back to “' + listName(1) + '”.', ok: 'Undo', cancel: 'Keep' }).then(function (y) {
          if (!y) return;
          patchLead(id, { confirmedAt: '' });
          nav.tab = 1;
          showLead(id);
        });
      } else if (act === 'form') startForm(id);
      else if (act === 'edit') showAdd(id);
      else if (act === 'note') {
        var t = document.getElementById('noteText').value.trim();
        if (!t) { K.toast('Write the note first'); return; }
        addNote(id, t);
        K.toast('Note saved ✓');
        showLead(id);
      }
    };
  }

  /* ============================ UNIT MATCHING ============================ */
  function normTxt(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function unitKey(u) { return u.project + ' · ' + u.unitType + ' ' + u.propertyType; }
  function matchUnits(answers) {
    var units = (config && config.units) || [];
    var want = { location: [], propertyType: [], unitType: [] };
    var budget = null;
    (answers || []).forEach(function (a) {
      if (a.skipped || !a.match || a.value == null || a.value === '') return;
      if (a.match === 'budget') {
        if (typeof a.value === 'object' && !Array.isArray(a.value)) budget = a.value;
        else if (Number(a.value)) budget = { max: Number(a.value) };
        return;
      }
      if (!want[a.match]) return;
      (Array.isArray(a.value) ? a.value : [a.value]).forEach(function (v) { want[a.match].push(normTxt(v)); });
    });
    var maxB = budget && budget.max ? Number(budget.max) : null;
    var target = maxB || (budget && budget.min ? Number(budget.min) : null);
    function pass(u, relax) {
      if (want.propertyType.length && want.propertyType.indexOf(normTxt(u.propertyType)) < 0) return false;
      if (!relax.unitType && want.unitType.length && want.unitType.indexOf(normTxt(u.unitType)) < 0) return false;
      if (!relax.location && want.location.length && want.location.indexOf(normTxt(u.location)) < 0) return false;
      if (!relax.budget && maxB && Number(u.price) > maxB) return false;
      return true;
    }
    var levels = [{}, { unitType: true }, { unitType: true, location: true }, { unitType: true, location: true, budget: true }];
    for (var i = 0; i < levels.length; i++) {
      var list = units.filter(function (u) { return pass(u, levels[i]); });
      if (list.length) {
        list.sort(function (a, b) {
          if (target) return Math.abs(a.price - target) - Math.abs(b.price - target);
          return a.price - b.price;
        });
        return { exact: i === 0, units: list.slice(0, 15) };
      }
    }
    return { exact: false, units: [] };
  }
  function unitCardHtml(u, liked) {
    var key = unitKey(u);
    var on = liked.indexOf(key) >= 0;
    return '<button class="unit' + (on ? ' on' : '') + '" data-unit="' + esc(key) + '">' +
      '<span class="u-top"><span class="u-proj">' + esc(u.project) + '</span><span class="u-tick">' + I.check + '</span></span>' +
      '<span class="u-type">' + esc(u.unitType + ' ' + u.propertyType) + (u.location ? ' · ' + esc(u.location) : '') + '</span>' +
      '<span class="u-price">Starting from <b>AED ' + K.fmtNum(u.price) + '</b></span>' +
      '<span class="u-meta">' + [u.paymentPlan ? 'Payment plan ' + esc(u.paymentPlan) : '', u.handover ? 'Handover ' + esc(u.handover) : '', u.size ? K.fmtNum(u.size) + ' sq ft' : ''].filter(Boolean).join(' · ') + '</span>' +
      '</button>';
  }
  function paintUnits(l) {
    var box = document.getElementById('units');
    var title = document.getElementById('unitsTitle');
    if (!box) return;
    var m = matchUnits(l.answers);
    var liked = l.liked || [];
    // keep liked units visible even if they no longer match
    var shown = m.units.slice();
    var allUnits = (config && config.units) || [];
    liked.forEach(function (k) {
      if (!shown.some(function (u) { return unitKey(u) === k; })) {
        var u = allUnits.filter(function (x) { return unitKey(x) === k; })[0];
        if (u) shown.unshift(u);
      }
    });
    if (title) title.textContent = m.exact ? 'Matching units' : 'Closest options';
    if (!shown.length) { box.innerHTML = '<p class="muted small">No units available yet.</p>'; return; }
    box.innerHTML = '<p class="muted small" style="margin:0 2px 10px">Tick the units the client liked.' + (liked.length ? ' <b>' + liked.length + ' liked</b>' : '') + '</p>' +
      shown.map(function (u) { return unitCardHtml(u, liked); }).join('');
  }
  function toggleLiked(id, key, el) {
    var l = getLead(id);
    if (!l) return;
    var liked = (l.liked || []).slice();
    var at = liked.indexOf(key);
    if (at >= 0) liked.splice(at, 1); else liked.push(key);
    patchLead(id, { liked: liked });
    el.classList.toggle('on', at < 0);
    var note = el.parentNode.querySelector('p.muted');
    if (note) note.innerHTML = 'Tick the units the client liked.' + (liked.length ? ' <b>' + liked.length + ' liked</b>' : '');
  }

  function showMatches(id) {
    var l = getLead(id);
    screen = 'matches';
    nav.leadId = id;
    render('<section class="screen">' +
      '<div class="topbar">' + brand() + '</div>' +
      '<div class="q-head"><div class="eyebrow">' + I.check.replace('<svg ', '<svg style="width:14px;height:14px;vertical-align:-2px" ') + ' Form saved · ' + esc(l.name) + '</div>' +
      '<h1 class="q-text" id="unitsTitle">Matching units</h1></div>' +
      '<div class="q-body" id="units"></div>' +
      '<div class="action-bar"><button class="btn btn-primary" data-act="done">Done</button></div>' +
      '</section>');
    paintUnits(l);
    root.onclick = function (e) {
      var u = e.target.closest('[data-unit]');
      if (u) return toggleLiked(id, u.getAttribute('data-unit'), u);
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.getAttribute('data-act') === 'done') { nav.tab = 3; nav.q = ''; showLead(id); }
      else if (a.getAttribute('data-act') === 'sync') manualSync();
    };
  }

  /* ================================ FORM ================================ */
  function startForm(id) {
    var l = getLead(id);
    if (!l) return;
    var go = function () {
      if (draft && draft.leadId === id && K.sameName(draft.agent, session.agent)) return renderStep();
      var hasCfg = config && config.questions && config.questions.length;
      if (!hasCfg) {
        K.toast('Loading questions…');
        refreshConfig().then(function () { startForm(id); }, function (err) {
          K.toast(err.code === 'NETWORK' ? 'Connect to the internet once to download the questions.' : err.message, 4000);
        });
        return;
      }
      var answers = {}, skipped = {};
      (l.answers || []).forEach(function (a) {
        if (a.skipped) skipped[a.id] = true;
        else if (a.value != null) answers[a.id] = a.value;
      });
      draft = {
        leadId: id, agent: session.agent, startedAt: nowIso(), qs: config.questions, projects: config.projects || [],
        answers: answers, skipped: skipped, hist: [], cur: 0
      };
      var first = nextVisible(-1);
      if (first < 0) { draft = null; return K.toast('There are no questions yet.'); }
      draft.cur = first;
      saveDraft();
      renderStep();
      refreshConfig().catch(function () { /* offline is fine */ });
    };
    if (draft && draft.leadId !== id && K.sameName(draft.agent, session.agent) && getLead(draft.leadId)) {
      K.confirmSheet({
        title: 'Discard the unfinished form?',
        text: 'The form for ' + getLead(draft.leadId).name + ' was not saved. Starting a new one deletes it.',
        ok: 'Discard & start', cancel: 'Keep it', danger: true
      }).then(function (yes) { if (yes) { draft = null; saveDraft(); go(); } });
      return;
    }
    go();
  }

  function qIndexById(id) {
    for (var i = 0; i < draft.qs.length; i++) if (draft.qs[i].id.toLowerCase() === String(id).toLowerCase()) return i;
    return -1;
  }
  function isVisible(q, depth) {
    depth = depth || 0;
    if (!q.showIf || !q.showIf.id) return true;
    if (depth > 20) return false;
    var pi = qIndexById(q.showIf.id);
    if (pi < 0) return false;
    var parent = draft.qs[pi];
    if (!isVisible(parent, depth + 1)) return false;
    if (draft.skipped[parent.id]) return false;
    var v = draft.answers[parent.id];
    if (v == null || v === '') return false;
    var wanted = (q.showIf.answers || []).map(function (s) { return String(s).trim().toLowerCase(); });
    if (!wanted.length) return true;
    var vals = Array.isArray(v) ? v : [v];
    return vals.some(function (x) { return wanted.indexOf(String(x).trim().toLowerCase()) >= 0; });
  }
  function nextVisible(from) {
    for (var i = from + 1; i < draft.qs.length; i++) if (isVisible(draft.qs[i])) return i;
    return -1;
  }
  function progress() {
    var done = draft.hist.length, remaining = 0;
    for (var i = draft.cur + 1; i < draft.qs.length; i++) if (isVisible(draft.qs[i])) remaining++;
    var total = done + 1 + remaining;
    return { step: done + 1, total: total, pct: Math.round((done / total) * 100), last: remaining === 0 };
  }

  function renderStep() {
    if (!draft) return goHome();
    var lead = getLead(draft.leadId);
    if (!lead) { draft = null; saveDraft(); return goHome(); }
    var q = draft.qs[draft.cur];
    if (!q) { draft.cur = nextVisible(-1); if (draft.cur < 0) return goHome(); q = draft.qs[draft.cur]; }
    screen = 'question';
    var p = progress();
    var ans = draft.answers[q.id];
    var hint = '';
    if (q.type === 'multi') hint = q.maxPicks ? 'Pick up to ' + q.maxPicks : 'Pick all that apply';
    if (q.type === 'range') hint = 'Fill one or both';
    if (q.skippable) hint = (hint ? hint + ' · ' : '') + 'Optional';

    render('<section class="screen flow">' +
      '<div class="flow-top">' +
      '<button class="icon-btn" data-act="exit" aria-label="Close">' + I.close + '</button>' +
      '<div class="progress"><i style="width:' + p.pct + '%"></i></div>' +
      '<div class="step-count">' + p.step + '/' + p.total + '</div></div>' +
      '<div class="q-head"><div class="eyebrow">' + esc(lead.name) + ' · Question ' + p.step + '</div><h1 class="q-text">' + esc(q.text) + '</h1>' +
      (hint ? '<div class="q-hint" id="qHint">' + esc(hint) + '</div>' : '') + '</div>' +
      '<div class="q-body">' + answerHtml(q, ans) + '<div class="err" id="qErr"></div></div>' +
      '<div class="action-bar">' +
      '<button class="btn btn-ghost btn-back" data-act="back" aria-label="Back">' + I.back + '</button>' +
      (q.skippable ? '<button class="btn btn-ghost" data-act="skip">Skip</button>' : '') +
      '<button class="btn btn-primary" data-act="next" id="nextBtn">' + (p.last ? 'Save answers' : 'Next') + '</button>' +
      '</div></section>');
    updateNext(q);

    var advancing = false;
    root.onclick = function (e) {
      var o = e.target.closest('[data-opt]');
      if (o && !advancing) {
        var val = o.getAttribute('data-opt');
        if (q.type === 'multi') {
          var cur = Array.isArray(draft.answers[q.id]) ? draft.answers[q.id].slice() : [];
          var at = cur.indexOf(val);
          if (at >= 0) cur.splice(at, 1);
          else {
            if (q.maxPicks && cur.length >= q.maxPicks) { K.toast('You can pick up to ' + q.maxPicks); return; }
            cur.push(val);
          }
          setAnswer(q, cur.length ? cur : null);
          updateNext(q);
        } else {
          setAnswer(q, val);
          updateNext(q);
          var pp = progress();
          var nb = document.getElementById('nextBtn');
          if (nb) nb.textContent = pp.last ? 'Save answers' : 'Next';
          if (!pp.last) { advancing = true; setTimeout(goNext, 200); }
        }
        return;
      }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'next') goNext();
      else if (act === 'back') goBack();
      else if (act === 'skip') skip(q);
      else if (act === 'exit') exitForm();
    };
    root.oninput = function (e) {
      if (q.type === 'text' || q.type === 'number') {
        var v = e.target.value.trim();
        setAnswer(q, v === '' ? null : (q.type === 'number' ? numVal(v) : v));
      } else if (q.type === 'range') {
        var mn = numVal(document.getElementById('rMin').value);
        var mx = numVal(document.getElementById('rMax').value);
        var o2 = {};
        if (mn != null) o2.min = mn;
        if (mx != null) o2.max = mx;
        setAnswer(q, o2.min != null || o2.max != null ? o2 : null);
      }
      document.getElementById('qErr').textContent = '';
      updateNext(q);
    };
    root.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        if (q.type === 'range' && e.target.id === 'rMin') return document.getElementById('rMax').focus();
        goNext();
      }
    };
  }

  function numVal(s) {
    var t = String(s == null ? '' : s).replace(/[^\d.]/g, '');
    if (t === '' || isNaN(Number(t))) return null;
    return Number(t);
  }

  function answerHtml(q, ans) {
    if (q.type === 'single' || q.type === 'multi') {
      return q.options.map(function (o) { return optHtml(q, o, ''); }).join('') ||
        '<div class="notice info">This question has no answers yet.</div>';
    }
    if (q.type === 'project') {
      var ps = draft.projects || [];
      if (!ps.length) return '<div class="notice info">No projects available.</div>';
      return ps.map(function (p) { return optHtml(q, p.name, [p.location, p.developer].filter(Boolean).join(' · ')); }).join('');
    }
    if (q.type === 'text') return '<input class="input" id="qInput" type="text" autocomplete="off" value="' + esc(ans || '') + '" placeholder="Type the answer">';
    if (q.type === 'number') return '<input class="input" id="qInput" type="text" inputmode="decimal" autocomplete="off" value="' + esc(ans == null ? '' : ans) + '" placeholder="0">';
    if (q.type === 'range') {
      var cur = /aed/i.test(q.text + ' ' + q.label) ? 'AED' : '';
      var v = ans || {};
      var fld = function (id, label, val) {
        return '<div class="field"><label for="' + id + '">' + label + '</label>' +
          (cur ? '<div class="input-prefix"><span class="pre">' + cur + '</span>' : '<div>') +
          '<input class="input" id="' + id + '" data-money type="text" inputmode="numeric" autocomplete="off" value="' + (val != null ? K.fmtNum(val) : '') + '" placeholder="' + (id === 'rMin' ? 'e.g. 1,000,000' : 'e.g. 2,500,000') + '"></div></div>';
      };
      return '<div class="range-row">' + fld('rMin', 'Minimum', v.min) + fld('rMax', 'Maximum', v.max) + '</div>';
    }
    return '';
  }

  function optHtml(q, value, sub) {
    var ans = draft.answers[q.id];
    var sel = Array.isArray(ans) ? ans.indexOf(value) >= 0 : ans === value;
    return '<button class="opt' + (q.type === 'multi' ? ' multi' : '') + (sel ? ' sel' : '') + '" data-opt="' + esc(value) + '">' +
      '<span>' + esc(value) + (sub ? '<span class="opt-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="mark">' + I.check + '</span></button>';
  }

  function paintOptions(q) {
    var ans = draft.answers[q.id];
    var full = q.type === 'multi' && q.maxPicks && Array.isArray(ans) && ans.length >= q.maxPicks;
    Array.prototype.forEach.call(root.querySelectorAll('[data-opt]'), function (b) {
      var v = b.getAttribute('data-opt');
      var sel = Array.isArray(ans) ? ans.indexOf(v) >= 0 : ans === v;
      b.classList.toggle('sel', sel);
      b.classList.toggle('dim', !!full && !sel);
    });
    if (q.type === 'multi') {
      var h = document.getElementById('qHint');
      var n = Array.isArray(ans) ? ans.length : 0;
      if (h) h.textContent = (q.maxPicks ? n + ' of ' + q.maxPicks + ' selected' : n + ' selected') + (q.skippable ? ' · Optional' : '');
    }
  }

  function setAnswer(q, v) {
    if (v == null) delete draft.answers[q.id];
    else draft.answers[q.id] = v;
    delete draft.skipped[q.id];
    saveDraft();
  }
  function hasAnswer(q) {
    var v = draft.answers[q.id];
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return v.min != null || v.max != null;
    return true;
  }
  function updateNext(q) {
    var b = document.getElementById('nextBtn');
    if (b) b.disabled = !hasAnswer(q);
    if (q.type === 'multi' || q.type === 'single' || q.type === 'project') paintOptions(q);
  }
  function validate(q) {
    if (!hasAnswer(q)) return q.type === 'range' ? 'Please enter the minimum, the maximum, or both.' : 'Please answer this question.';
    var v = draft.answers[q.id];
    if (q.type === 'range' && v.min != null && v.max != null && v.min > v.max) return 'Minimum should be less than maximum.';
    return '';
  }
  function goNext() {
    var q = draft.qs[draft.cur];
    var err = validate(q);
    if (err) { var el = document.getElementById('qErr'); if (el) el.textContent = err; return; }
    advanceFrom(draft.cur);
  }
  function advanceFrom(idx) {
    draft.hist.push(idx);
    var n = nextVisible(idx);
    if (n < 0) return finishForm();
    draft.cur = n;
    saveDraft();
    renderStep();
  }
  function skip(q) {
    delete draft.answers[q.id];
    draft.skipped[q.id] = true;
    saveDraft();
    advanceFrom(draft.cur);
  }
  function goBack() {
    if (!draft.hist.length) return exitForm();
    draft.cur = draft.hist.pop();
    saveDraft();
    renderStep();
  }
  function exitForm() {
    var id = draft.leadId;
    K.confirmSheet({
      title: 'Leave the form?',
      text: 'Nothing is lost — you can continue it from the home screen.',
      ok: 'Leave', cancel: 'Stay here'
    }).then(function (yes) { if (yes) showLead(id); });
  }
  function finishForm() {
    var id = draft.leadId;
    var lead = getLead(id);
    var answers = draft.hist.map(function (i) {
      var q = draft.qs[i];
      var skipped = !!draft.skipped[q.id];
      var v = skipped ? null : draft.answers[q.id];
      return { id: q.id, label: q.label, question: q.text, type: q.type, match: q.match || '', skipped: skipped, value: v == null ? null : v };
    });
    var now = nowIso();
    var patch = { answers: answers, formAt: (lead && lead.formAt) || now };
    if (lead && !lead.confirmedAt) patch.confirmedAt = now;
    patchLead(id, patch);
    draft = null;
    saveDraft();
    K.toast('Answers saved ✓');
    showMatches(id);
  }

  function answerText(a) {
    if (a.skipped) return 'Skipped';
    var v = a.value;
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') {
      if (v.min && v.max) return 'AED ' + K.fmtNum(v.min) + ' – ' + K.fmtNum(v.max);
      if (v.max) return 'Up to AED ' + K.fmtNum(v.max);
      if (v.min) return 'From AED ' + K.fmtNum(v.min);
      return '';
    }
    if (a.type === 'number') return K.fmtNum(v);
    return String(v);
  }

  // format money fields with commas when the agent leaves the field
  root.addEventListener('focusout', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-money')) {
      var n = numVal(e.target.value);
      e.target.value = n == null ? '' : K.fmtNum(n);
    }
  });

  /* ========================= HARDWARE BACK BUTTON ========================= */
  function onHardwareBack() {
    var sheet = document.querySelector('.sheet-bg');
    if (sheet) { sheet.remove(); return; }
    if (screen === 'question') goBack();
    else if (screen === 'pin') showLogin();
    else if (screen === 'lead') showLists();
    else if (screen === 'matches') showLead(nav.leadId);
    else if (screen === 'add' || screen === 'added' || screen === 'lists') goHome();
  }
  try {
    history.replaceState({ k: 'base' }, '');
    history.pushState({ k: 'app' }, '');
    window.addEventListener('popstate', function () {
      history.pushState({ k: 'app' }, '');
      onHardwareBack();
    });
  } catch (e) { /* ignore */ }

  /* ============================ INSTALL (download) ============================ */
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // keep it for our own "Download the app" button
    installPrompt = e;
  });
  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    var b = document.querySelector('.install-btn');
    if (b) b.remove();
    K.toast('App installed ✓ Open it from your home screen.', 4000);
  });
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function installBtnHtml() {
    if (isStandalone()) return '';
    return '<button class="install-btn" data-install>' +
      '<img src="img/roadshow-180.png" alt="" width="44" height="44">' +
      '<span><b>Download the app</b><br><span class="s">Add KATAL Roadshow to your home screen</span></span>' +
      '<span class="dl">' + I.download + '</span></button>';
  }
  function installApp() {
    if (installPrompt) {
      var p = installPrompt;
      installPrompt = null;
      p.prompt();
      if (p.userChoice) p.userChoice.then(function (c) { if (c && c.outcome !== 'accepted') installPrompt = p; }, function () { /* ignore */ });
      return;
    }
    installHelp();
  }
  function installHelp() {
    var ios = isIOS();
    var step = function (n, html) { return '<li><span class="n">' + n + '</span><span>' + html + '</span></li>'; };
    var steps = ios
      ? step(1, 'Open this page in <b>Safari</b>.') +
        step(2, 'Tap the Share button <span class="ic-inline">' + I.share + '</span> at the bottom of the screen.') +
        step(3, 'Scroll down and tap <b>Add to Home Screen</b> <span class="ic-inline">' + I.addbox + '</span>, then <b>Add</b>.')
      : step(1, 'Tap the menu <span class="ic-inline">' + I.dots + '</span> at the top right of Chrome.') +
        step(2, 'Tap <b>Install app</b> or <b>Add to Home screen</b>.') +
        step(3, 'Tap <b>Install</b>.');
    var bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = '<div class="sheet install-sheet" role="dialog" aria-modal="true">' +
      '<img src="img/roadshow-180.png" alt="" width="72" height="72">' +
      '<h3>Download the app</h3><p>Two taps and KATAL Roadshow is on your home screen.</p>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<button class="btn btn-primary btn-block" data-close>Got it</button></div>';
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
    document.body.appendChild(bg);
  }
  root.addEventListener('click', function (e) { if (e.target.closest('[data-install]')) installApp(); });

  /* ================================ BOOT ================================ */
  // one-time clean-up of data from v1.0 (old single-flow drafts)
  LS.del('draft');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
  }
  if (session && session.token) {
    goHome();
    refreshConfig().catch(function () { /* offline: cached config is used */ });
    refreshLeads().catch(function () { /* offline: local copy */ });
    K.sync();
  } else {
    showLogin();
  }
})();
