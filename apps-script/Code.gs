/******************************************************************************
 * KATAL PROPERTY · Roadshow Lead Capture · Backend (Google Apps Script)
 *
 * ONE-TIME INSTALL
 *   1. Open the Google Sheet → Extensions → Apps Script.
 *   2. Delete everything in Code.gs, paste this whole file, click Save (💾).
 *   3. In the toolbar pick the function "setup" → Run → allow access.
 *   4. Deploy → New deployment → ⚙ Web app →
 *        Execute as: Me   ·   Who has access: Anyone   → Deploy.
 *   5. Copy the "Web app URL" (ends with /exec).
 *
 * AFTER PASTING A NEWER VERSION OF THIS CODE
 *   Deploy → Manage deployments → ✏️ (edit) → Version: "New version" → Deploy.
 *   The URL stays the same.
 ******************************************************************************/

var APP_VERSION = '1.0.0';
var TZ = 'Asia/Dubai';

var T = {
  SETTINGS: 'Settings', AGENTS: 'Agents', QUESTIONS: 'Questions',
  PROJECTS: 'Projects', UNITS: 'Units', LEADS: 'Leads', NOTES: 'Notes'
};

var TYPE_NAMES = ['Single choice', 'Multiple choice', 'Short text', 'Number', 'Min–Max range', 'Project picker'];
var MATCH_NAMES = ['Location', 'Property Type', 'Unit Type', 'Budget'];

// [key, header, width, help note]
var COLS = {
  Settings: [
    ['key', 'Setting', 200, 'Do not rename the setting names in this column.'],
    ['value', 'Value', 260, 'Edit the values in this column.'],
    ['help', 'Help', 460, '']
  ],
  Agents: [
    ['name', 'Agent Name', 220, 'Name shown on the login screen.'],
    ['pin', 'PIN', 110, '4-digit PIN the agent types to log in.'],
    ['active', 'Active', 90, 'Yes = can log in. No = blocked.']
  ],
  Questions: [
    ['id', 'Question ID', 115, 'Unique short code (e.g. Q15). Used in "Show If Question ID". Do not change it after leads are collected. Left empty = filled automatically.'],
    ['order', 'Order', 70, 'Questions are asked from the smallest number to the biggest. Decimals are OK (e.g. 4.5 goes between 4 and 5).'],
    ['text', 'Question', 380, 'The question the agent sees.'],
    ['label', 'Short Label', 190, 'Short name used as the column title in the Leads tab and on the dashboard. Questions with the same label share one column.'],
    ['type', 'Type', 150, 'Single choice · Multiple choice · Short text · Number · Min–Max range · Project picker'],
    ['options', 'Options', 400, 'Answers separated by commas. Only for Single choice / Multiple choice.'],
    ['maxPicks', 'Max Picks', 90, 'Multiple choice only: the most answers the agent can pick. Empty = no limit.'],
    ['skippable', 'Skippable', 95, 'Yes = the agent sees a Skip button.'],
    ['showIfId', 'Show If Question ID', 155, 'Empty = always shown. Otherwise the ID of an EARLIER question…'],
    ['showIfAnswers', 'Show If Answers', 230, '…and the answers (comma separated) of that question that make this one appear.'],
    ['active', 'Active', 80, 'No = hidden from agents.'],
    ['dashboard', 'Show On Dashboard', 145, 'Yes = shown as a column on the admin dashboard.'],
    ['matchField', 'Match Field', 140, 'Used to match units: Location · Property Type · Unit Type · Budget. Empty = not used.']
  ],
  Projects: [
    ['name', 'Project Name', 270, 'Must be written exactly the same in the Units tab.'],
    ['developer', 'Developer', 160, ''],
    ['location', 'Location', 150, 'Same words as the Location answers (e.g. Abu Dhabi).'],
    ['handover', 'Handover', 120, ''],
    ['paymentPlan', 'Payment Plan', 190, ''],
    ['brochure', 'Brochure Link', 260, ''],
    ['active', 'Active', 80, 'No = hidden from agents.']
  ],
  Units: [
    ['project', 'Project Name', 270, 'Exactly as in the Projects tab.'],
    ['propertyType', 'Property Type', 140, 'Same words as the Property type answers: Apartment, Townhouse, Villa, Penthouse.'],
    ['unitType', 'Unit Type', 110, 'Same words as the Unit type answers: Studio, 1BR, 2BR …'],
    ['price', 'Starting Price (AED)', 165, 'Numbers only.'],
    ['size', 'Size From (sq ft)', 140, 'Numbers only.'],
    ['available', 'Available', 95, 'No = not shown to agents.']
  ],
  Notes: [
    ['id', 'Note ID', 160, ''],
    ['time', 'Time', 150, ''],
    ['leadId', 'Lead ID', 160, ''],
    ['agent', 'Agent', 160, ''],
    ['client', 'Client Name', 180, ''],
    ['text', 'Note', 460, '']
  ]
};

var LEAD_FIXED = [
  ['id', 'Lead ID', 160], ['time', 'Time', 140], ['agent', 'Agent', 150],
  ['name', 'Client Name', 180], ['phone', 'Phone', 150], ['liked', 'Liked Units', 320]
];
var LEAD_RAW = 'Raw JSON';

/* ================================== SETUP ================================== */

/**
 * Run this once from the Apps Script editor (select "setup" → Run).
 * Safe to run again: it never deletes your data. It only adds missing tabs/columns.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet: Extensions → Apps Script.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  secret_();
  try { ss.setSpreadsheetTimeZone(TZ); } catch (e) { /* ignore */ }

  var adminPin = String(Math.floor(100000 + Math.random() * 900000));

  setupTab_(ss, T.SETTINGS, [
    ['Event Name', 'KATAL Property Roadshow', 'Shown at the top of the app.'],
    ['Admin PIN', adminPin, 'PIN for the admin dashboard. Change it to any number you like (6+ digits recommended).'],
    ['Default Country Code', '+971', 'Country code selected by default on the phone field.']
  ]);
  setupTab_(ss, T.AGENTS, [
    ['Test Agent 1', '1111', 'Yes'],
    ['Test Agent 2', '2222', 'Yes'],
    ['Test Agent 3', '3333', 'Yes']
  ]);
  setupTab_(ss, T.QUESTIONS, [
    ['Q1', 1, 'What is the purpose of buying?', 'Purpose', 'Single choice', 'Investment, Live in it', '', 'No', '', '', 'Yes', 'No', ''],
    ['Q2', 2, 'Which property type are you looking for?', 'Property type', 'Single choice', 'Apartment, Townhouse, Villa, Penthouse', '', 'No', '', '', 'Yes', 'No', 'Property Type'],
    ['Q3A', 3, 'Which unit type?', 'Unit type', 'Single choice', 'Studio, 1BR, 2BR, 3BR, 4BR', '', 'No', 'Q2', 'Apartment, Penthouse', 'Yes', 'Yes', 'Unit Type'],
    ['Q3B', 4, 'Which unit type?', 'Unit type', 'Single choice', '3BR, 4BR, 5BR+', '', 'No', 'Q2', 'Villa, Townhouse', 'Yes', 'Yes', 'Unit Type'],
    ['Q4', 5, 'What is the preferred location?', 'Location', 'Single choice', 'Abu Dhabi, Dubai, Ras Al Khaimah, London, Egypt', '', 'No', '', '', 'Yes', 'No', 'Location'],
    ['Q5', 6, 'When are you planning to buy?', 'Buying timeline', 'Single choice', 'Today, Within a month, 1–3 months, More than 3 months', '', 'No', '', '', 'Yes', 'No', ''],
    ['Q6', 7, 'What is your main interest?', 'Main interest', 'Single choice', 'Location, Capital growth, Lifestyle, Rental income', '', 'No', '', '', 'Yes', 'No', ''],
    ['Q7', 8, 'Have you purchased off-plan before?', 'Bought off-plan before', 'Single choice', 'Yes, No', '', 'Yes', '', '', 'Yes', 'No', ''],
    ['Q8', 9, 'Do you already own a unit with Aldar?', 'Owns Aldar unit', 'Single choice', 'Yes, No', '', 'Yes', '', '', 'Yes', 'No', ''],
    ['Q9', 10, 'What are you looking for?', 'Looking for', 'Single choice', 'One unit, Multiple units, Not decided', '', 'No', '', '', 'Yes', 'No', ''],
    ['Q10', 11, 'Are you interested in a current Aldar project?', 'Interested in Aldar project', 'Single choice', 'Yes, No', '', 'No', '', '', 'Yes', 'No', ''],
    ['Q10A', 12, 'Which project?', 'Project', 'Project picker', '', '', 'No', 'Q10', 'Yes', 'Yes', 'No', ''],
    ['Q11', 13, 'What is your budget (AED)?', 'Budget (AED)', 'Min–Max range', '', '', 'No', '', '', 'Yes', 'Yes', 'Budget'],
    ['Q12', 14, 'Who is the decision maker?', 'Decision maker', 'Single choice', 'Me, Shared decision', '', 'Yes', '', '', 'Yes', 'No', ''],
    ['Q13', 15, 'What are your top 3 priorities?', 'Top priorities', 'Multiple choice', 'Price, View, Location, Payment plan, Size, Handover, Community', 3, 'Yes', '', '', 'Yes', 'No', ''],
    ['Q14', 16, 'If we find a suitable unit, would you consider reserving during the roadshow?', 'Reserve during roadshow', 'Single choice', 'Yes, Maybe, No', '', 'No', '', '', 'Yes', 'Yes', '']
  ]);
  setupTab_(ss, T.PROJECTS, [
    ['SAMPLE – Marina Heights', 'SAMPLE Developer', 'Abu Dhabi', 'Q4 2028', '60/40', 'https://example.com/sample-brochure', 'Yes'],
    ['SAMPLE – Palm Grove Villas', 'SAMPLE Developer', 'Dubai', 'Q2 2029', '50/50', 'https://example.com/sample-brochure', 'Yes'],
    ['SAMPLE – Coral Bay Residences', 'SAMPLE Developer', 'Ras Al Khaimah', 'Q1 2028', '70/30 post-handover', 'https://example.com/sample-brochure', 'Yes']
  ]);
  setupTab_(ss, T.UNITS, [
    ['SAMPLE – Marina Heights', 'Apartment', 'Studio', 850000, 450, 'Yes'],
    ['SAMPLE – Marina Heights', 'Apartment', '1BR', 1250000, 750, 'Yes'],
    ['SAMPLE – Marina Heights', 'Apartment', '2BR', 1900000, 1150, 'Yes'],
    ['SAMPLE – Marina Heights', 'Apartment', '3BR', 2800000, 1650, 'Yes'],
    ['SAMPLE – Marina Heights', 'Penthouse', '4BR', 6500000, 3800, 'Yes'],
    ['SAMPLE – Palm Grove Villas', 'Townhouse', '3BR', 2600000, 2100, 'Yes'],
    ['SAMPLE – Palm Grove Villas', 'Townhouse', '4BR', 3100000, 2500, 'Yes'],
    ['SAMPLE – Palm Grove Villas', 'Villa', '4BR', 4800000, 3600, 'Yes'],
    ['SAMPLE – Palm Grove Villas', 'Villa', '5BR+', 6900000, 5200, 'Yes'],
    ['SAMPLE – Coral Bay Residences', 'Apartment', 'Studio', 620000, 430, 'No'],
    ['SAMPLE – Coral Bay Residences', 'Apartment', '1BR', 950000, 780, 'Yes'],
    ['SAMPLE – Coral Bay Residences', 'Apartment', '2BR', 1450000, 1200, 'Yes'],
    ['SAMPLE – Coral Bay Residences', 'Villa', '3BR', 2950000, 2900, 'Yes']
  ]);
  setupTab_(ss, T.NOTES, []);

  // Leads tab
  var leads = ss.getSheetByName(T.LEADS) || ss.insertSheet(T.LEADS);
  ensureLeadColumns_(leads);
  leads.setFrozenRows(1);
  var lh = headerRow_(leads);
  styleHeader_(leads.getRange(1, 1, 1, lh.length));
  LEAD_FIXED.forEach(function (c, i) { leads.setColumnWidth(i + 1, c[2]); });
  leads.setColumnWidth(lh.length, 260);

  // Validations (dropdowns) to keep the tabs easy to edit
  var yn = ['Yes', 'No'];
  dropdown_(ss, T.AGENTS, 'active', yn);
  dropdown_(ss, T.QUESTIONS, 'type', TYPE_NAMES);
  dropdown_(ss, T.QUESTIONS, 'skippable', yn);
  dropdown_(ss, T.QUESTIONS, 'active', yn);
  dropdown_(ss, T.QUESTIONS, 'dashboard', yn);
  dropdown_(ss, T.QUESTIONS, 'matchField', MATCH_NAMES);
  dropdown_(ss, T.PROJECTS, 'active', yn);
  dropdown_(ss, T.UNITS, 'available', yn);

  // Tab order
  [T.SETTINGS, T.AGENTS, T.QUESTIONS, T.PROJECTS, T.UNITS, T.LEADS, T.NOTES].forEach(function (name, i) {
    var sh = ss.getSheetByName(name);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  // Remove the empty default sheet
  ['Sheet1', 'Feuille 1', 'Hoja 1', 'ورقة1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(ss.getSheetByName(T.SETTINGS));

  var pinNow = getSettings_().adminPin;
  var msg = 'Setup complete ✅  Admin PIN: ' + pinNow + '  (change it in the Settings tab).';
  Logger.log(msg);
  try { ss.toast(msg, 'KATAL Roadshow', 15); } catch (e) { /* ignore */ }
  return msg;
}

function setupTab_(ss, name, sample) {
  var cols = COLS[name];
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var isNew = sh.getLastRow() === 0;
  if (isNew) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]);
  }
  var headers = headerRow_(sh);
  var map = mapHeaders_(headers, cols);
  // add any missing columns at the end
  cols.forEach(function (c) {
    if (map[c[0]] < 0) {
      var col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(c[1]);
      map[c[0]] = col - 1;
    }
  });
  var width = sh.getLastColumn();
  styleHeader_(sh.getRange(1, 1, 1, width));
  sh.setFrozenRows(1);
  cols.forEach(function (c) {
    var i = map[c[0]];
    sh.setColumnWidth(i + 1, c[2]);
    if (c[3]) sh.getRange(1, i + 1).setNote(c[3]);
  });
  // plain-text columns (keep leading zeros, stop auto-dates)
  var textCols = { Settings: ['value'], Agents: ['pin'], Projects: ['handover', 'paymentPlan'], Questions: ['id', 'options', 'showIfAnswers'], Units: ['unitType'] }[name] || [];
  textCols.forEach(function (k) {
    sh.getRange(2, map[k] + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
  if (name === T.UNITS) {
    sh.getRange(2, map.price + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('#,##0');
    sh.getRange(2, map.size + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('#,##0');
  }
  if (name === T.NOTES) {
    sh.getRange(2, map.text + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setWrap(true);
  }
  if (sh.getLastRow() <= 1 && sample.length) {
    var rows = sample.map(function (s) {
      var row = [];
      for (var i = 0; i < width; i++) row.push('');
      cols.forEach(function (c, j) { if (s[j] !== undefined) row[map[c[0]]] = s[j]; });
      return row;
    });
    sh.getRange(2, 1, rows.length, width).setValues(rows);
  }
  return sh;
}

function styleHeader_(range) {
  range.setFontWeight('bold').setBackground('#1C2733').setFontColor('#FFFFFF')
    .setVerticalAlignment('middle').setWrap(true);
}

function dropdown_(ss, tab, key, values) {
  var sh = ss.getSheetByName(tab);
  var map = mapHeaders_(headerRow_(sh), COLS[tab]);
  if (map[key] < 0) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  sh.getRange(2, map[key] + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

/** Adds a small menu in the Sheet: KATAL → Repair tabs & Leads columns */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('KATAL')
      .addItem('Repair tabs & Leads columns', 'setup')
      .addToUi();
  } catch (e) { /* ignore */ }
}

/* ============================== WEB ENTRY POINTS ============================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'agents') return out_(safe_(function () { return apiAgents_(); }));
  return out_({ ok: true, app: 'KATAL Roadshow API', version: APP_VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  return out_(safe_(function () {
    var body = (e && e.postData && e.postData.contents) || '{}';
    var req;
    try { req = JSON.parse(body); } catch (err) { throw fail_('Bad request', 'BAD_REQUEST'); }
    var routes = {
      ping: function () { return { ok: true, version: APP_VERSION }; },
      agents: apiAgents_,
      login: apiLogin_,
      config: apiConfig_,
      saveLead: apiSaveLead_,
      checkPhone: apiCheckPhone_,
      myLeads: apiMyLeads_,
      setLiked: apiSetLiked_,
      addNote: apiAddNote_,
      adminLogin: apiAdminLogin_,
      dashboard: apiDashboard_,
      adminData: apiAdminData_,
      adminSave: apiAdminSave_
    };
    var fn = routes[req.action];
    if (!fn) throw fail_('Unknown action', 'BAD_REQUEST');
    return fn(req);
  }));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safe_(fn) {
  try {
    return fn();
  } catch (err) {
    if (err && err.isApi) return { ok: false, error: err.message, code: err.code };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'Server error: ' + (err && err.message ? err.message : err), code: 'SERVER' };
  }
}

function fail_(msg, code) {
  var e = new Error(msg);
  e.isApi = true;
  e.code = code || 'ERROR';
  return e;
}

/* ================================== API ================================== */

function apiAgents_() {
  var s = getSettings_();
  var names = getAgents_().filter(function (a) { return a.active; }).map(function (a) { return a.name; });
  return { ok: true, eventName: s.eventName, agents: names };
}

function apiLogin_(req) {
  var name = String(req.name || '').trim();
  var pin = String(req.pin || '').trim();
  var key = 'agent:' + name.toLowerCase();
  throttleCheck_(key);
  var ag = findAgent_(name);
  if (!ag || !ag.active || !pinEq_(ag.pin, pin)) {
    throttleFail_(key);
    throw fail_('Wrong name or PIN', 'BAD_PIN');
  }
  throttleClear_(key);
  return { ok: true, token: agentToken_(ag), agent: ag.name };
}

function apiAdminLogin_(req) {
  var pin = String(req.pin || '').trim();
  throttleCheck_('admin');
  var s = getSettings_();
  if (!s.adminPin || !pinEq_(s.adminPin, pin)) {
    throttleFail_('admin');
    throw fail_('Wrong admin PIN', 'BAD_PIN');
  }
  throttleClear_('admin');
  return { ok: true, token: adminToken_(s.adminPin) };
}

function apiConfig_(req) {
  var who = requireAny_(req.token);
  var s = getSettings_();
  var projects = getProjects_(false);
  var byName = {};
  projects.forEach(function (p) { byName[p.name.toLowerCase()] = p; });
  var units = getUnits_(false).filter(function (u) {
    return byName[u.project.toLowerCase()];
  }).map(function (u) {
    var p = byName[u.project.toLowerCase()];
    u.project = p.name;
    u.location = p.location;
    u.developer = p.developer;
    u.handover = p.handover;
    u.paymentPlan = p.paymentPlan;
    u.brochure = p.brochure;
    return u;
  });
  return {
    ok: true,
    agent: who.name || '',
    eventName: s.eventName,
    countryCode: s.countryCode,
    questions: getQuestions_(false),
    projects: projects,
    units: units,
    serverTime: new Date().toISOString()
  };
}

function apiSaveLead_(req) {
  var ag = requireAgent_(req.token);
  var L = req.lead || {};
  var id = String(L.id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw fail_('Invalid lead id', 'BAD_REQUEST');
  var name = clip_(L.name, 200);
  var phone = clip_(L.phone, 40);
  if (!name) throw fail_('Client name is missing', 'BAD_REQUEST');
  if (digits_(phone).length < 6) throw fail_('Phone number is missing', 'BAD_REQUEST');

  var answers = (Array.isArray(L.answers) ? L.answers : []).slice(0, 200).map(function (a) {
    return {
      id: clip_(a.id, 40), label: clip_(a.label, 200), question: clip_(a.question, 500),
      type: clip_(a.type, 20), skipped: !!a.skipped, value: cleanValue_(a.value)
    };
  });
  var liked = cleanList_(L.liked);
  var created = new Date(L.createdAt);
  if (isNaN(created.getTime()) || created.getTime() > Date.now() + 86400000) created = new Date();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(T.LEADS);
    var headers = ensureLeadColumns_(sh);
    var idx = leadIdx_(headers);
    if (findRow_(sh, idx.id, id) > 0) return { ok: true, id: id, duplicate: true };

    var raw = {
      v: 1, id: id, createdAt: created.toISOString(), receivedAt: new Date().toISOString(),
      agent: ag.name, name: name, phone: phone, answers: answers, liked: liked,
      device: clip_(L.device, 200)
    };
    var byLabel = {};
    answers.forEach(function (a) {
      var k = (a.label || a.question || a.id).trim().toLowerCase();
      var text = answerText_(a);
      if (text === '') return;
      byLabel[k] = byLabel[k] ? byLabel[k] + ' / ' + text : text;
    });
    var row = [], formats = [];
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim();
      var v = '';
      var f = '@';
      if (c === idx.id) v = id;
      else if (c === idx.time) { v = created; f = 'yyyy-mm-dd hh:mm'; }
      else if (c === idx.agent) v = ag.name;
      else if (c === idx.name) v = name;
      else if (c === idx.phone) v = phone;
      else if (c === idx.liked) v = liked.join('\n');
      else if (c === idx.raw) v = JSON.stringify(raw);
      else if (h) v = byLabel[h.toLowerCase()] || '';
      row.push(v);
      formats.push(f);
    }
    var r = sh.getLastRow() + 1;
    var range = sh.getRange(r, 1, 1, headers.length);
    range.setNumberFormats([formats]);
    range.setValues([row]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function apiCheckPhone_(req) {
  var ag = requireAgent_(req.token);
  var want = digits_(req.phone);
  if (want.length < 6) return { ok: true, exists: false };
  var t = leadsTable_();
  var count = 0, mine = false;
  t.rows.forEach(function (row) {
    if (digits_(row[t.idx.phone]) === want) {
      count++;
      if (sameName_(row[t.idx.agent], ag.name)) mine = true;
    }
  });
  return { ok: true, exists: count > 0, mine: mine, count: count };
}

function apiMyLeads_(req) {
  var ag = requireAgent_(req.token);
  var t = leadsTable_();
  var leads = [];
  t.rows.forEach(function (row) {
    if (sameName_(row[t.idx.agent], ag.name)) leads.push(parseLeadRow_(t, row));
  });
  attachNotes_(leads);
  leads.sort(byTimeDesc_);
  return { ok: true, leads: leads };
}

function apiSetLiked_(req) {
  var ag = requireAgent_(req.token);
  var id = String(req.leadId || '').trim();
  var liked = cleanList_(req.liked);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(T.LEADS);
    var headers = headerRow_(sh);
    var idx = leadIdx_(headers);
    var r = findRow_(sh, idx.id, id);
    if (r < 0) throw fail_('Lead not found yet', 'LEAD_NOT_FOUND');
    var row = sh.getRange(r, 1, 1, headers.length).getValues()[0];
    if (!sameName_(row[idx.agent], ag.name)) throw fail_('Not your lead', 'FORBIDDEN');
    if (idx.liked >= 0) {
      var cell = sh.getRange(r, idx.liked + 1);
      cell.setNumberFormat('@');
      cell.setValue(liked.join('\n'));
    }
    if (idx.raw >= 0) {
      var raw = parseJson_(row[idx.raw]) || {};
      raw.liked = liked;
      var rc = sh.getRange(r, idx.raw + 1);
      rc.setNumberFormat('@');
      rc.setValue(JSON.stringify(raw));
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function apiAddNote_(req) {
  var ag = requireAgent_(req.token);
  var noteId = String(req.noteId || '').trim();
  var leadId = String(req.leadId || '').trim();
  var text = clip_(req.text, 5000);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(noteId)) throw fail_('Invalid note id', 'BAD_REQUEST');
  if (!text) throw fail_('Empty note', 'BAD_REQUEST');
  var when = new Date(req.createdAt);
  if (isNaN(when.getTime()) || when.getTime() > Date.now() + 86400000) when = new Date();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var lsh = sheet_(T.LEADS);
    var lh = headerRow_(lsh);
    var li = leadIdx_(lh);
    var r = findRow_(lsh, li.id, leadId);
    if (r < 0) throw fail_('Lead not found yet', 'LEAD_NOT_FOUND');
    var lrow = lsh.getRange(r, 1, 1, lh.length).getValues()[0];
    if (!sameName_(lrow[li.agent], ag.name)) throw fail_('Not your lead', 'FORBIDDEN');

    var nsh = sheet_(T.NOTES);
    var nt = readTable_(T.NOTES);
    var exists = nt.rows.some(function (n) { return String(n.id) === noteId; });
    if (exists) return { ok: true, duplicate: true };
    var headers = nt.headers;
    var row = [], formats = [];
    for (var c = 0; c < headers.length; c++) {
      var v = '', f = '@';
      if (c === nt.map.id) v = noteId;
      else if (c === nt.map.time) { v = when; f = 'yyyy-mm-dd hh:mm'; }
      else if (c === nt.map.leadId) v = leadId;
      else if (c === nt.map.agent) v = ag.name;
      else if (c === nt.map.client) v = String(lrow[li.name] || '');
      else if (c === nt.map.text) v = text;
      row.push(v);
      formats.push(f);
    }
    var range = nsh.getRange(nsh.getLastRow() + 1, 1, 1, headers.length);
    range.setNumberFormats([formats]);
    range.setValues([row]);
    return { ok: true, note: { id: noteId, leadId: leadId, time: when.toISOString(), agent: ag.name, text: text } };
  } finally {
    lock.releaseLock();
  }
}

function apiDashboard_(req) {
  requireAdmin_(req.token);
  var t = leadsTable_();
  var leads = t.rows.map(function (row) { return parseLeadRow_(t, row); });
  attachNotes_(leads);
  leads.sort(byTimeDesc_);
  return {
    ok: true,
    eventName: getSettings_().eventName,
    leads: leads,
    columns: t.labelCols,
    questions: getQuestions_(true),
    agents: getAgents_().map(function (a) { return { name: a.name, active: a.active }; })
  };
}

function apiAdminData_(req) {
  requireAdmin_(req.token);
  var tabs = {};
  [T.SETTINGS, T.AGENTS, T.QUESTIONS, T.PROJECTS, T.UNITS].forEach(function (name) {
    tabs[name] = readTable_(name).rows.map(function (r) {
      var o = {};
      COLS[name].forEach(function (c) { o[c[0]] = cellOut_(r[c[0]]); });
      return o;
    });
  });
  return { ok: true, tabs: tabs, types: TYPE_NAMES, matchFields: MATCH_NAMES };
}

function apiAdminSave_(req) {
  requireAdmin_(req.token);
  var tab = String(req.tab || '');
  if ([T.SETTINGS, T.AGENTS, T.QUESTIONS, T.PROJECTS, T.UNITS].indexOf(tab) < 0) throw fail_('Unknown tab', 'BAD_REQUEST');
  var rows = Array.isArray(req.rows) ? req.rows : [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    writeTable_(tab, rows);
    if (tab === T.QUESTIONS) ensureLeadColumns_(sheet_(T.LEADS));
    var res = { ok: true };
    if (tab === T.SETTINGS) res.token = adminToken_(getSettings_().adminPin);
    return res;
  } finally {
    lock.releaseLock();
  }
}

/* ================================== AUTH ================================== */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())).replace(/=+$/, '');
}

function normPin_(p) {
  var s = String(p == null ? '' : p).trim().replace(/^0+/, '');
  return s === '' && String(p).trim() !== '' ? '0' : s;
}

function pinEq_(stored, typed) {
  var a = normPin_(stored), b = normPin_(typed);
  return a !== '' && a === b;
}

function agentToken_(ag) {
  return 'a:' + encodeURIComponent(ag.name) + ':' + sign_('a|' + ag.name.toLowerCase() + '|' + normPin_(ag.pin));
}

function adminToken_(pin) {
  return 'x:admin:' + sign_('x|admin|' + normPin_(pin));
}

function parseToken_(tok) {
  var p = String(tok || '').split(':');
  if (p.length !== 3) throw fail_('Please log in again', 'AUTH');
  var name;
  try { name = decodeURIComponent(p[1]); } catch (e) { throw fail_('Please log in again', 'AUTH'); }
  return { kind: p[0], name: name, sig: p[2] };
}

function requireAgent_(tok) {
  var t = parseToken_(tok);
  if (t.kind !== 'a') throw fail_('Please log in again', 'AUTH');
  var ag = findAgent_(t.name);
  if (!ag || !ag.active) throw fail_('Please log in again', 'AUTH');
  if (agentToken_(ag) !== tok) throw fail_('Please log in again', 'AUTH');
  return ag;
}

function requireAdmin_(tok) {
  var t = parseToken_(tok);
  var s = getSettings_();
  if (t.kind !== 'x' || !s.adminPin || adminToken_(s.adminPin) !== tok) throw fail_('Please log in again', 'AUTH');
  return { admin: true, name: 'Admin' };
}

function requireAny_(tok) {
  var t = parseToken_(tok);
  return t.kind === 'x' ? requireAdmin_(tok) : requireAgent_(tok);
}

function throttleKey_(k) { return 'fail:' + encodeURIComponent(k).slice(0, 200); }

function throttleCheck_(k) {
  var n = Number(CacheService.getScriptCache().get(throttleKey_(k)) || 0);
  if (n >= 6) throw fail_('Too many wrong PINs. Please wait 10 minutes.', 'LOCKED');
}

function throttleFail_(k) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(throttleKey_(k)) || 0) + 1;
  c.put(throttleKey_(k), String(n), 600);
}

function throttleClear_(k) { CacheService.getScriptCache().remove(throttleKey_(k)); }

/* ============================== SHEET READERS ============================== */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* fall through */ }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw fail_('This script must be opened from the Google Sheet (Extensions → Apps Script).', 'SETUP');
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw fail_('The "' + name + '" tab is missing. Open Apps Script and run setup.', 'SETUP');
  return sh;
}

function headerRow_(sh) {
  var lc = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
}

function norm_(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function mapHeaders_(headers, cols) {
  var nh = headers.map(norm_);
  var map = {}, used = {};
  cols.forEach(function (c) {
    var i = nh.indexOf(norm_(c[1]));
    if (i >= 0) { map[c[0]] = i; used[i] = true; }
  });
  cols.forEach(function (c) {
    if (map[c[0]] != null) return;
    var n = norm_(c[1]);
    map[c[0]] = -1;
    for (var i = 0; i < nh.length; i++) {
      if (!used[i] && nh[i] && nh[i].indexOf(n) === 0) { map[c[0]] = i; used[i] = true; break; }
    }
  });
  return map;
}

function readTable_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var map = mapHeaders_(headers, COLS[name]);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row.some(function (v) { return String(v).trim() !== ''; })) continue;
    var o = { _row: r + 1 };
    COLS[name].forEach(function (c) {
      var i = map[c[0]];
      o[c[0]] = i >= 0 ? row[i] : '';
    });
    rows.push(o);
  }
  return { sheet: sh, headers: headers, map: map, rows: rows };
}

function writeTable_(name, rows) {
  var sh = sheet_(name);
  var headers = headerRow_(sh);
  var map = mapHeaders_(headers, COLS[name]);
  var width = headers.length;
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, width).clearContent();
  if (!rows.length) return;
  var data = rows.map(function (o) {
    var row = [];
    for (var i = 0; i < width; i++) row.push('');
    COLS[name].forEach(function (c) {
      var i = map[c[0]];
      if (i >= 0 && o[c[0]] != null) row[i] = typeof o[c[0]] === 'number' ? o[c[0]] : String(o[c[0]]).slice(0, 5000);
    });
    return row;
  });
  var range = sh.getRange(2, 1, data.length, width);
  var textCols = { Agents: ['pin'], Settings: ['value'], Projects: ['handover'], Questions: ['id'] }[name] || [];
  textCols.forEach(function (k) {
    if (map[k] >= 0) sh.getRange(2, map[k] + 1, data.length, 1).setNumberFormat('@');
  });
  range.setValues(data);
}

function yes_(v, dflt) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === '') return !!dflt;
  return /^(y|yes|true|1|✓|✔|نعم)/.test(s);
}

function list_(v) {
  return String(v == null ? '' : v).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function num_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function cellOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'MMM yyyy');
  return v;
}

function text_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'MMM yyyy');
  return String(v == null ? '' : v).trim();
}

function parseType_(t) {
  var s = String(t || '').toLowerCase();
  if (s.indexOf('multi') >= 0) return 'multi';
  if (s.indexOf('range') >= 0 || s.indexOf('min') >= 0) return 'range';
  if (s.indexOf('project') >= 0) return 'project';
  if (s.indexOf('number') >= 0) return 'number';
  if (s.indexOf('text') >= 0) return 'text';
  return 'single';
}

function parseMatch_(m) {
  var s = norm_(m);
  if (!s) return '';
  if (s.indexOf('location') >= 0 || s.indexOf('city') >= 0) return 'location';
  if (s.indexOf('property') >= 0) return 'propertyType';
  if (s.indexOf('unit') >= 0 || s.indexOf('bed') >= 0) return 'unitType';
  if (s.indexOf('budget') >= 0 || s.indexOf('price') >= 0) return 'budget';
  return '';
}

function getSettings_() {
  var s = {};
  readTable_(T.SETTINGS).rows.forEach(function (r) { s[norm_(r.key)] = r.value; });
  return {
    eventName: text_(s.eventname) || 'KATAL Roadshow',
    adminPin: text_(s.adminpin),
    countryCode: text_(s.defaultcountrycode) || '+971'
  };
}

function getAgents_() {
  return readTable_(T.AGENTS).rows.map(function (r) {
    return { name: text_(r.name), pin: text_(r.pin), active: yes_(r.active, true) };
  }).filter(function (a) { return a.name; });
}

function findAgent_(name) {
  var n = String(name || '').trim().toLowerCase();
  var all = getAgents_();
  for (var i = 0; i < all.length; i++) if (all[i].name.toLowerCase() === n) return all[i];
  return null;
}

function sameName_(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

function getQuestions_(includeInactive) {
  var t = readTable_(T.QUESTIONS);
  fixQuestionIds_(t);
  var seen = {};
  var qs = t.rows.map(function (r) {
    var id = text_(r.id);
    if (seen[id.toLowerCase()]) id = id + '-' + r._row;
    seen[id.toLowerCase()] = true;
    var text = text_(r.text);
    var sid = text_(r.showIfId);
    return {
      id: id,
      order: r.order === '' || isNaN(Number(r.order)) ? 9999 : Number(r.order),
      row: r._row,
      text: text,
      label: text_(r.label) || text,
      type: parseType_(r.type),
      options: list_(r.options),
      maxPicks: parseInt(r.maxPicks, 10) || 0,
      skippable: yes_(r.skippable, false),
      showIf: sid ? { id: sid, answers: list_(r.showIfAnswers) } : null,
      active: yes_(r.active, true),
      dashboard: yes_(r.dashboard, false),
      match: parseMatch_(r.matchField)
    };
  }).filter(function (q) { return q.text && (includeInactive || q.active); });
  qs.sort(function (a, b) { return a.order - b.order || a.row - b.row; });
  return qs;
}

function fixQuestionIds_(t) {
  var missing = t.rows.filter(function (r) { return !text_(r.id) && text_(r.text); });
  if (!missing.length || t.map.id < 0) return;
  var max = 0;
  t.rows.forEach(function (r) {
    var m = /^Q(\d+)/i.exec(text_(r.id));
    if (m) max = Math.max(max, Number(m[1]));
  });
  missing.forEach(function (r) {
    max++;
    r.id = 'Q' + max;
    var cell = t.sheet.getRange(r._row, t.map.id + 1);
    cell.setNumberFormat('@');
    cell.setValue(r.id);
  });
}

function getProjects_(includeInactive) {
  return readTable_(T.PROJECTS).rows.map(function (r) {
    return {
      name: text_(r.name), developer: text_(r.developer), location: text_(r.location),
      handover: text_(r.handover), paymentPlan: text_(r.paymentPlan), brochure: text_(r.brochure),
      active: yes_(r.active, true)
    };
  }).filter(function (p) { return p.name && (includeInactive || p.active); });
}

function getUnits_(includeUnavailable) {
  return readTable_(T.UNITS).rows.map(function (r) {
    return {
      project: text_(r.project), propertyType: text_(r.propertyType), unitType: text_(r.unitType),
      price: num_(r.price), size: num_(r.size), available: yes_(r.available, true)
    };
  }).filter(function (u) { return u.project && (includeUnavailable || u.available); });
}

/* ================================== LEADS ================================== */

function leadIdx_(headers) {
  var map = mapHeaders_(headers, LEAD_FIXED.concat([['raw', LEAD_RAW]]));
  return map;
}

function ensureLeadColumns_(sh) {
  var headers = headerRow_(sh);
  if (!headers.some(Boolean)) {
    headers = LEAD_FIXED.map(function (c) { return c[1]; }).concat([LEAD_RAW]);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sh.getRange(1, 1, 1, headers.length));
  }
  var idx = leadIdx_(headers);
  var fixedNames = {};
  LEAD_FIXED.forEach(function (c) { fixedNames[c[1].toLowerCase()] = true; });
  fixedNames[LEAD_RAW.toLowerCase()] = true;
  if (idx.raw < 0) {
    sh.getRange(1, headers.length + 1).setValue(LEAD_RAW);
    styleHeader_(sh.getRange(1, headers.length + 1));
    headers.push(LEAD_RAW);
    idx.raw = headers.length - 1;
  }
  var have = {};
  headers.forEach(function (h) { have[h.toLowerCase()] = true; });
  var labels = [];
  getQuestions_(false).forEach(function (q) {
    var l = q.label.trim();
    if (!l || have[l.toLowerCase()] || fixedNames[l.toLowerCase()]) return;
    have[l.toLowerCase()] = true;
    labels.push(l);
  });
  labels.forEach(function (l) {
    var col = idx.raw + 1; // 1-based position of the Raw JSON column
    sh.insertColumnBefore(col);
    var cell = sh.getRange(1, col);
    cell.setValue(l);
    styleHeader_(cell);
    sh.setColumnWidth(col, 170);
    headers.splice(idx.raw, 0, l);
    idx.raw++;
  });
  return headers;
}

function leadsTable_() {
  var sh = sheet_(T.LEADS);
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var idx = leadIdx_(headers);
  var fixed = {};
  Object.keys(idx).forEach(function (k) { if (idx[k] >= 0) fixed[idx[k]] = true; });
  var labelCols = [];
  headers.forEach(function (h, i) { if (h && !fixed[i]) labelCols.push({ label: h, index: i }); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (idx.id >= 0 && String(values[r][idx.id]).trim() === '') continue;
    rows.push(values[r]);
  }
  return { headers: headers, idx: idx, rows: rows, labelCols: labelCols.map(function (c) { return c.label; }), labelIdx: labelCols };
}

function parseLeadRow_(t, row) {
  var idx = t.idx;
  var raw = idx.raw >= 0 ? (parseJson_(row[idx.raw]) || {}) : {};
  var time = idx.time >= 0 && row[idx.time] instanceof Date ? row[idx.time].toISOString() : (raw.createdAt || '');
  var cells = {};
  t.labelIdx.forEach(function (c) {
    var v = row[c.index];
    cells[c.label] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v == null ? '' : v);
  });
  var likedCell = idx.liked >= 0 ? String(row[idx.liked] || '') : '';
  return {
    id: String(row[idx.id] || raw.id || ''),
    time: time,
    agent: String(idx.agent >= 0 ? row[idx.agent] : raw.agent || ''),
    name: String(idx.name >= 0 ? row[idx.name] : raw.name || ''),
    phone: String(idx.phone >= 0 ? row[idx.phone] : raw.phone || ''),
    liked: likedCell ? likedCell.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) : (raw.liked || []),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    cells: cells,
    notes: []
  };
}

function attachNotes_(leads) {
  if (!leads.length) return;
  var byId = {};
  leads.forEach(function (l) { byId[l.id] = l; });
  readTable_(T.NOTES).rows.forEach(function (n) {
    var l = byId[String(n.leadId)];
    if (!l) return;
    l.notes.push({
      id: String(n.id), time: n.time instanceof Date ? n.time.toISOString() : String(n.time || ''),
      agent: String(n.agent || ''), text: String(n.text || '')
    });
  });
  leads.forEach(function (l) { l.notes.sort(function (a, b) { return a.time < b.time ? -1 : 1; }); });
}

function byTimeDesc_(a, b) { return a.time < b.time ? 1 : a.time > b.time ? -1 : 0; }

function findRow_(sh, colIdx, value) {
  if (colIdx < 0 || !value) return -1;
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, colIdx + 1, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() === value) return i + 2;
  return -1;
}

function answerText_(a) {
  if (a.skipped) return 'Skipped';
  var v = a.value;
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') {
    var mn = v.min, mx = v.max;
    if (mn && mx) return fmtNum_(mn) + ' – ' + fmtNum_(mx);
    if (mx) return 'Up to ' + fmtNum_(mx);
    if (mn) return 'From ' + fmtNum_(mn);
    return '';
  }
  if (a.type === 'number') return fmtNum_(v);
  return String(v);
}

function fmtNum_(n) {
  var x = Number(n);
  if (isNaN(x)) return String(n);
  var parts = String(Math.round(x * 100) / 100).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function cleanValue_(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.slice(0, 50).map(function (x) { return clip_(x, 300); });
  if (typeof v === 'object') {
    var o = {};
    if (v.min != null && v.min !== '') o.min = Number(v.min) || 0;
    if (v.max != null && v.max !== '') o.max = Number(v.max) || 0;
    return o;
  }
  if (typeof v === 'number') return v;
  return clip_(v, 2000);
}

function cleanList_(v) {
  return (Array.isArray(v) ? v : []).slice(0, 50).map(function (x) { return clip_(x, 300); }).filter(Boolean);
}

function clip_(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function parseJson_(s) { try { return JSON.parse(String(s || '')); } catch (e) { return null; } }
