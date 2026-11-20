/* KATAL Roadshow – agent app */
(function () {
  'use strict';
  var LS = K.LS, api = K.api, Outbox = K.Outbox, esc = K.esc, I = K.ICONS;
  var root = document.getElementById('app');

  var APP_LABEL = 'v1.0';
  var session = LS.get('session', null);      // { token, agent, at }
  var config = LS.get('config', null);        // { eventName, countryCode, questions, projects, units, fetchedAt }
  var agentsCache = LS.get('agents', null);   // { eventName, agents }
  var draft = LS.get('draft', null);          // lead in progress
  var screen = '';
  var lastSaved = null;

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

  function render(html) { root.innerHTML = html; window.scrollTo(0, 0); }
  function brand() {
    return '<div class="brand"><div class="brand-mark">K</div><div class="brand-text"><span class="brand-name">KATAL</span><span class="brand-sub">PROPERTY</span></div></div>';
  }
  function eventName() {
    return (config && config.eventName) || (agentsCache && agentsCache.eventName) || 'Roadshow';
  }
  function saveDraft() { if (draft) LS.set('draft', draft); else LS.del('draft'); }

  /* =============================== SYNC UI =============================== */
  function pillHtml() {
    var s = K.status();
    var cls = '', txt = 'All synced';
    if (s.offline) { cls = 'is-offline'; txt = s.pending ? 'Offline · ' + s.pending + ' pending sync' : 'Offline'; }
    else if (s.pending && s.syncing) { cls = 'is-pending'; txt = 'Syncing ' + s.pending + '…'; }
    else if (s.pending && s.error) { cls = 'is-error'; txt = s.pending + ' pending sync'; }
    else if (s.pending) { cls = 'is-pending'; txt = s.pending + ' pending sync'; }
    return '<button class="pill ' + cls + '" data-act="sync"><span class="dot"></span>' + esc(txt) + '</button>';
  }
  function refreshSyncUi() {
    var p = document.getElementById('syncPill');
    if (p) p.innerHTML = pillHtml();
    var n = document.getElementById('pendingNum');
    if (n) n.textContent = Outbox.count();
    var sl = document.getElementById('savedSync');
    if (sl && lastSaved) sl.innerHTML = savedLine(lastSaved.id);
  }
  K.on('sync', refreshSyncUi);
  K.on('outbox', refreshSyncUi);
  K.on('synced', refreshSyncUi);

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
      '<div class="home-foot"><span>' + APP_LABEL + '</span><span></span></div>' +
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
    if (!agentsCache.agents.length) return '<div class="notice info">No active agents yet. Add them in the Agents tab of the Google Sheet.</div>';
    return agentsCache.agents.map(function (n) {
      return '<button class="agent-btn" data-agent="' + esc(n) + '"><span class="avatar">' + esc(K.initials(n)) + '</span>' + esc(n) + '<span class="chev">' + I.chev + '</span></button>';
    }).join('');
  }
  function loadAgents(showSpinner) {
    var list = document.getElementById('agentList');
    if (showSpinner && list) list.innerHTML = '<div class="center-msg"><div><div class="spinner"></div>Loading agents…</div></div>';
    api('agents', {}, { timeout: 20000 }).then(function (r) {
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
      if (agentsCache && agentsCache.agents && err.code === 'NETWORK') return; // keep cached list
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
    function paint() {
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('on', i < pin.length); });
    }
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
      api('login', { name: name, pin: pin }, { timeout: 20000 }).then(function (r) {
        session = { token: r.token, agent: r.agent, at: new Date().toISOString() };
        LS.set('session', session);
        document.removeEventListener('keydown', onKey);
        refreshConfig().catch(function () { /* handled on home */ });
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
      text: n ? n + ' item(s) are still waiting to sync. They stay safe on this phone and will sync automatically when online.' : 'You will need your PIN to sign in again.',
      ok: 'Log out', cancel: 'Stay signed in'
    }).then(function (yes) {
      if (!yes) return;
      session = null; draft = null;
      LS.del('session'); LS.del('draft');
      showLogin();
    });
  }
  function forceLogout(msg) {
    session = null;
    LS.del('session');
    showLogin(msg);
  }

  /* ================================ CONFIG ================================ */
  var configPromise = null;
  function refreshConfig() {
    if (!session) return Promise.reject(new K.ApiError('Not signed in', 'AUTH'));
    if (configPromise) return configPromise;
    configPromise = api('config', { token: session.token }, { timeout: 25000 }).then(function (r) {
      config = {
        eventName: r.eventName, countryCode: r.countryCode || '+971', questions: r.questions || [],
        projects: r.projects || [], units: r.units || [], fetchedAt: new Date().toISOString()
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
  function localLeads() { return LS.get('localLeads', []); }
  function todayCount() {
    var today = new Date().toDateString();
    return localLeads().filter(function (l) {
      return K.sameName(l.agent, session && session.agent) && new Date(l.createdAt).toDateString() === today;
    }).length;
  }

  function goHome() {
    screen = 'home';
    var first = String(session.agent || '').split(' ')[0];
    var hasCfg = config && config.questions && config.questions.length;
    var resume = draft && K.sameName(draft.agent, session.agent);
    render('<section class="screen">' +
      '<div class="topbar">' + brand() + '<div id="syncPill">' + pillHtml() + '</div></div>' +
      '<div class="home-hero"><div class="eyebrow">' + esc(eventName()) + '</div><h1 class="title">Hello, ' + esc(first) + '</h1></div>' +
      (resume ? '<button class="card-btn is-resume" data-act="resume" style="margin:0 0 12px"><span class="ic">' + I.resume + '</span><span><span class="t">Continue unfinished lead</span><br><span class="s">Started ' + esc(K.fmtTime(draft.startedAt)) + ' · not saved yet</span></span><span class="chev">' + I.chev + '</span></button>' : '') +
      '<button class="cta-card" data-act="new"><span class="cta-icon">' + I.plus + '</span><span><span class="cta-title">New Lead</span><br><span class="cta-sub">' +
      (hasCfg ? 'Start a new client conversation' : 'Loading questions…') + '</span></span></button>' +
      '<button class="card-btn" data-act="leads"><span class="ic">' + I.list + '</span><span><span class="t">My Leads</span><br><span class="s">Coming in the next update</span></span><span class="chev">' + I.chev + '</span></button>' +
      '<div class="stats"><div class="stat"><b>' + todayCount() + '</b><span>Leads today on this phone</span></div>' +
      '<div class="stat"><b id="pendingNum">' + Outbox.count() + '</b><span>Pending sync</span></div></div>' +
      '<div class="home-foot"><span>' + esc(session.agent) + ' · ' + APP_LABEL + '</span><button class="link" data-act="logout">Log out</button></div>' +
      '</section>');
    root.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'new') newLead();
      else if (act === 'resume') { renderStep(); }
      else if (act === 'leads') K.toast('My Leads is coming in the next update');
      else if (act === 'logout') logout();
      else if (act === 'sync') { manualSync(); }
    };
  }

  function manualSync() {
    var s = K.status();
    if (s.offline) return K.toast('You are offline. Leads will sync when internet is back.');
    if (!s.pending) return K.toast('Everything is synced ✓');
    K.toast('Syncing…');
    K.sync().then(function () {
      var st = K.status();
      K.toast(st.pending ? (st.error || 'Still pending — will retry automatically') : 'All synced ✓');
    });
  }

  function newLead() {
    var hasCfg = config && config.questions && config.questions.length;
    if (!hasCfg) {
      K.toast('Loading questions…');
      refreshConfig().then(function () { startLead(); }, function (err) {
        K.toast(err.code === 'NETWORK' ? 'Connect to the internet once to download the questions.' : err.message, 4000);
      });
      return;
    }
    if (draft && K.sameName(draft.agent, session.agent)) {
      K.confirmSheet({
        title: 'Discard unfinished lead?',
        text: 'You have an unfinished lead from ' + K.fmtTime(draft.startedAt) + '. Starting a new one will delete it.',
        ok: 'Discard & start new', cancel: 'Keep it', danger: true
      }).then(function (yes) { if (yes) startLead(); });
      return;
    }
    startLead();
  }

  /* ============================ QUESTION FLOW ============================ */
  function startLead() {
    draft = {
      id: K.uid('L'), agent: session.agent, startedAt: new Date().toISOString(),
      qs: config.questions, projects: config.projects || [], cc: config.countryCode || '+971',
      answers: {}, skipped: {}, hist: [], cur: 0, contact: { name: '', cc: '', phone: '' }
    };
    var first = nextVisible(-1);
    draft.cur = first < 0 ? 'contact' : first;
    saveDraft();
    renderStep();
    refreshConfig().catch(function () { /* offline is fine */ });
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
    var done = draft.hist.length;
    var remaining = 0;
    if (draft.cur !== 'contact') {
      for (var i = draft.cur + 1; i < draft.qs.length; i++) if (isVisible(draft.qs[i])) remaining++;
    }
    var total = done + (draft.cur === 'contact' ? 1 : 2 + remaining);
    return { step: done + 1, total: total, pct: Math.round((done / total) * 100) };
  }

  function renderStep() {
    if (!draft) return goHome();
    if (draft.cur === 'contact') return renderContact();
    var q = draft.qs[draft.cur];
    if (!q) { draft.cur = 'contact'; return renderContact(); }
    screen = 'question';
    var p = progress();
    var ans = draft.answers[q.id];
    var hint = '';
    if (q.type === 'multi') hint = q.maxPicks ? 'Pick up to ' + q.maxPicks : 'Pick all that apply';
    if (q.type === 'range') hint = 'Fill one or both';
    if (q.skippable) hint = (hint ? hint + ' · ' : '') + 'Optional';

    render('<section class="screen flow">' +
      flowTop(p) +
      '<div class="q-head"><div class="eyebrow">Question ' + p.step + '</div><h1 class="q-text">' + esc(q.text) + '</h1>' +
      (hint ? '<div class="q-hint" id="qHint">' + esc(hint) + '</div>' : '') + '</div>' +
      '<div class="q-body">' + answerHtml(q, ans) + '<div class="err" id="qErr"></div></div>' +
      '<div class="action-bar">' +
      '<button class="btn btn-ghost btn-back" data-act="back" aria-label="Back">' + I.back + '</button>' +
      (q.skippable ? '<button class="btn btn-ghost" data-act="skip">Skip</button>' : '') +
      '<button class="btn btn-primary" data-act="next" id="nextBtn">Next</button>' +
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
          paintOptions(q);
          updateNext(q);
        } else {
          setAnswer(q, val);
          paintOptions(q);
          advancing = true;
          setTimeout(goNext, 200);
        }
        return;
      }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'next') goNext();
      else if (act === 'back') goBack();
      else if (act === 'skip') skip(q);
      else if (act === 'exit') exitFlow();
    };
    root.oninput = function (e) {
      if (q.type === 'text' || q.type === 'number') {
        var v = e.target.value.trim();
        setAnswer(q, v === '' ? null : (q.type === 'number' ? numVal(v) : v));
      } else if (q.type === 'range') {
        var mn = numVal(document.getElementById('rMin').value);
        var mx = numVal(document.getElementById('rMax').value);
        var o = {};
        if (mn != null) o.min = mn;
        if (mx != null) o.max = mx;
        setAnswer(q, o.min != null || o.max != null ? o : null);
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

  function flowTop(p) {
    return '<div class="flow-top">' +
      '<button class="icon-btn" data-act="exit" aria-label="Close">' + I.close + '</button>' +
      '<div class="progress"><i style="width:' + p.pct + '%"></i></div>' +
      '<div class="step-count">' + p.step + '/' + p.total + '</div></div>';
  }

  function numVal(s) {
    var t = String(s == null ? '' : s).replace(/[^\d.]/g, '');
    if (t === '' || isNaN(Number(t))) return null;
    return Number(t);
  }

  function answerHtml(q, ans) {
    if (q.type === 'single' || q.type === 'multi') {
      return q.options.map(function (o) { return optHtml(q, o, ''); }).join('') ||
        '<div class="notice info">This question has no options yet (Questions tab → Options).</div>';
    }
    if (q.type === 'project') {
      var ps = draft.projects || [];
      if (!ps.length) return '<div class="notice info">No active projects in the Projects tab.</div>';
      return ps.map(function (p) { return optHtml(q, p.name, [p.location, p.developer].filter(Boolean).join(' · ')); }).join('');
    }
    if (q.type === 'text') {
      return '<input class="input" id="qInput" type="text" autocomplete="off" value="' + esc(ans || '') + '" placeholder="Type the answer">';
    }
    if (q.type === 'number') {
      return '<input class="input" id="qInput" type="text" inputmode="decimal" autocomplete="off" value="' + esc(ans == null ? '' : ans) + '" placeholder="0">';
    }
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
    var multi = q.type === 'multi';
    return '<button class="opt' + (multi ? ' multi' : '') + (sel ? ' sel' : '') + '" data-opt="' + esc(value) + '">' +
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
    if (draft.cur === 'contact') return;
    var q = draft.qs[draft.cur];
    var err = validate(q);
    if (err) { var el = document.getElementById('qErr'); if (el) el.textContent = err; return; }
    advanceFrom(draft.cur);
  }
  function advanceFrom(idx) {
    draft.hist.push(idx);
    var n = nextVisible(idx);
    draft.cur = n < 0 ? 'contact' : n;
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
    if (!draft.hist.length) return exitFlow();
    draft.cur = draft.hist.pop();
    saveDraft();
    renderStep();
  }
  function exitFlow() {
    var any = Object.keys(draft.answers).length || draft.hist.length;
    if (!any) { draft = null; saveDraft(); return goHome(); }
    K.confirmSheet({
      title: 'Leave this lead?',
      text: 'Nothing is lost — you can continue it from the home screen.',
      ok: 'Go to home', cancel: 'Stay here'
    }).then(function (yes) { if (yes) goHome(); });
  }

  /* ============================ CONTACT STEP ============================ */
  function renderContact() {
    screen = 'contact';
    var p = progress();
    var c = draft.contact;
    var cc = c.cc || ccDefaultValue();
    var opts = COUNTRIES.map(function (x) {
      var v = x[1] + '|' + x[0];
      return '<option value="' + v + '"' + (v === cc ? ' selected' : '') + '>' + flag(x[0]) + ' ' + x[2] + ' (' + x[1] + ')</option>';
    }).join('');
    render('<section class="screen flow">' + flowTop(p) +
      '<div class="q-head"><div class="eyebrow">Last step</div><h1 class="q-text">Client details</h1></div>' +
      '<div class="q-body" style="gap:18px">' +
      '<div class="field"><label for="cName">Client name</label><input class="input" id="cName" type="text" autocomplete="off" autocapitalize="words" placeholder="Full name" value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label for="cPhone">Phone number</label><div class="phone-row">' +
      '<div class="cc"><div class="cc-face"><span id="ccFace">' + ccFace(cc) + '</span><span class="caret">▼</span></div><select id="cc" aria-label="Country code">' + opts + '</select></div>' +
      '<input class="input" id="cPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="50 123 4567" value="' + esc(c.phone) + '"></div></div>' +
      '<div id="dupWarn"></div>' +
      '<div class="err" id="cErr"></div>' +
      '</div>' +
      '<div class="action-bar">' +
      '<button class="btn btn-ghost btn-back" data-act="back" aria-label="Back">' + I.back + '</button>' +
      '<button class="btn btn-primary" data-act="save" id="saveBtn">Save lead</button>' +
      '</div></section>');
    var dupTimer = null, dupSeq = 0;
    function readContact() {
      draft.contact.name = document.getElementById('cName').value;
      draft.contact.phone = document.getElementById('cPhone').value;
      draft.contact.cc = document.getElementById('cc').value;
      saveDraft();
    }
    function checkDup() {
      if (!draft || screen !== 'contact') return;
      var full = fullPhone();
      var warnEl = document.getElementById('dupWarn');
      var d = K.digits(full);
      if (d.length < 8) { warnEl.innerHTML = ''; return; }
      var local = localLeads().some(function (l) { return K.digits(l.phone) === d && l.id !== draft.id; });
      if (local) { showDup('This number was already saved on this phone.'); }
      else warnEl.innerHTML = '';
      var seq = ++dupSeq;
      api('checkPhone', { token: session.token, phone: full }, { timeout: 7000 }).then(function (r) {
        if (seq !== dupSeq || screen !== 'contact') return;
        if (r.exists) showDup(r.mine ? 'This number is already in your leads.' : 'This number was already registered by another agent.');
        else if (!local) document.getElementById('dupWarn').innerHTML = '';
      }, function () { /* offline: local check only */ });
    }
    function showDup(text) {
      document.getElementById('dupWarn').innerHTML = '<div class="notice warn">' + I.warn + '<div><b>Phone already exists.</b> ' + esc(text) + ' You can still save.</div></div>';
    }
    root.oninput = function (e) {
      readContact();
      document.getElementById('cErr').textContent = '';
      if (e.target.id === 'cPhone' || e.target.id === 'cc') {
        clearTimeout(dupTimer);
        dupTimer = setTimeout(checkDup, 650);
      }
    };
    root.onchange = function (e) {
      if (e.target.id === 'cc') {
        readContact();
        document.getElementById('ccFace').innerHTML = ccFace(e.target.value);
        clearTimeout(dupTimer);
        dupTimer = setTimeout(checkDup, 300);
      }
    };
    root.onkeydown = function (e) {
      if (e.key === 'Enter' && e.target.id === 'cName') { e.preventDefault(); document.getElementById('cPhone').focus(); }
      else if (e.key === 'Enter' && e.target.id === 'cPhone') { e.preventDefault(); saveLead(); }
    };
    root.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'back') goBack();
      else if (act === 'exit') exitFlow();
      else if (act === 'save') saveLead();
    };
    if (c.phone) checkDup();
  }

  function ccDefaultValue() {
    var code = (draft && draft.cc) || '+971';
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i][1] === code) return COUNTRIES[i][1] + '|' + COUNTRIES[i][0];
    return '+971|AE';
  }
  function ccFace(v) {
    var p = String(v).split('|');
    return flag(p[1] || 'AE') + ' ' + esc(p[0]);
  }
  function fullPhone() {
    var raw = String(draft.contact.phone || '').trim();
    var code = String(draft.contact.cc || ccDefaultValue()).split('|')[0];
    if (/^(\+|00)/.test(raw)) return '+' + K.digits(raw).replace(/^00/, '');
    var d = K.digits(raw).replace(/^0+/, '');
    var cd = K.digits(code);
    if (d.indexOf(cd) === 0 && d.length > cd.length + 7) d = d.slice(cd.length); // typed the country code again
    return code + d;
  }

  function saveLead() {
    if (!draft || screen !== 'contact') return;
    var name = String(draft.contact.name || '').trim().replace(/\s+/g, ' ');
    var err = document.getElementById('cErr');
    var raw = K.digits(draft.contact.phone);
    if (name.length < 2) { err.textContent = 'Please enter the client name.'; document.getElementById('cName').focus(); return; }
    if (raw.replace(/^0+/, '').length < 6) { err.textContent = 'Please enter a valid phone number.'; document.getElementById('cPhone').focus(); return; }
    var phone = fullPhone();
    var answers = draft.hist.map(function (i) {
      var q = draft.qs[i];
      var skipped = !!draft.skipped[q.id];
      var v = skipped ? null : draft.answers[q.id];
      return { id: q.id, label: q.label, question: q.text, type: q.type, match: q.match || '', skipped: skipped, value: v == null ? null : v };
    });
    var lead = {
      id: draft.id, createdAt: new Date().toISOString(), startedAt: draft.startedAt,
      name: name, phone: phone, answers: answers, liked: [],
      device: String(navigator.userAgent || '').slice(0, 160)
    };
    Outbox.add('saveLead', { lead: lead }, session.token, session.agent);
    var ll = localLeads();
    ll.push({ id: lead.id, agent: session.agent, name: name, phone: phone, createdAt: lead.createdAt, answers: answers, liked: [] });
    LS.set('localLeads', ll.slice(-500));
    draft = null;
    saveDraft();
    lastSaved = lead;
    showSaved(lead);
    K.sync();
  }

  /* ================================ SAVED ================================ */
  function savedLine(id) {
    var pending = Outbox.list().some(function (o) { return o.action === 'saveLead' && o.data.lead.id === id; });
    var s = K.status();
    if (!pending) return '<div class="notice ok">' + I.check + '<div>Synced to the Google Sheet</div></div>';
    if (s.offline) return '<div class="notice warn">' + I.warn + '<div>No internet. Saved on this phone — it will sync automatically.</div></div>';
    if (s.syncing) return '<div class="notice info"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></div><div>Sending to the Google Sheet…</div></div>';
    return '<div class="notice warn">' + I.warn + '<div>Saved on this phone — will sync automatically' + (s.error ? ' (' + esc(s.error) + ')' : '') + '.</div></div>';
  }

  function showSaved(lead) {
    screen = 'saved';
    render('<section class="screen">' +
      '<div class="topbar">' + brand() + '<div id="syncPill">' + pillHtml() + '</div></div>' +
      '<div class="done-wrap">' +
      '<div class="done-badge">' + I.check + '</div>' +
      '<h1 class="title">Lead saved</h1>' +
      '<p class="subtitle">' + esc(lead.name) + ' · ' + esc(lead.phone) + '</p>' +
      '<div class="sync-line" id="savedSync">' + savedLine(lead.id) + '</div>' +
      '</div>' +
      '<div class="action-bar" style="flex-direction:column">' +
      '<button class="btn btn-primary btn-block" data-act="new">' + I.plus + ' New Lead</button>' +
      '<button class="btn btn-ghost btn-block" data-act="home">Home</button>' +
      '</div></section>');
    root.oninput = null; root.onchange = null; root.onkeydown = null;
    root.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'new') newLead();
      else if (act === 'home') goHome();
      else if (act === 'sync') manualSync();
    };
  }

  /* ========================= HARDWARE BACK BUTTON ========================= */
  function onHardwareBack() {
    var hasSheet = document.querySelector('.sheet-bg');
    if (hasSheet) { hasSheet.remove(); return; }
    if (screen === 'question' || screen === 'contact') goBack();
    else if (screen === 'pin') showLogin();
    else if (screen === 'saved') goHome();
  }
  try {
    history.replaceState({ k: 'base' }, '');
    history.pushState({ k: 'app' }, '');
    window.addEventListener('popstate', function () {
      history.pushState({ k: 'app' }, '');
      onHardwareBack();
    });
  } catch (e) { /* ignore */ }

  // format money fields with commas when the agent leaves the field
  root.addEventListener('focusout', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-money')) {
      var n = numVal(e.target.value);
      e.target.value = n == null ? '' : K.fmtNum(n);
    }
  });

  /* ================================ BOOT ================================ */
  function boot() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    }
    root.oninput = null; root.onchange = null; root.onkeydown = null;
    if (session && session.token) {
      goHome();
      refreshConfig().catch(function () { /* offline: cached config is used */ });
      K.sync();
    } else {
      showLogin();
    }
  }
  // reset per-screen handlers whenever the screen changes
  var _render = render;
  render = function (html) {
    root.oninput = null; root.onchange = null; root.onkeydown = null;
    _render(html);
  };

  boot();
})();
