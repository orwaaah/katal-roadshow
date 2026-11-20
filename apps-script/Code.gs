/******************************************************************************
 * KATAL PROPERTY · Roadshow Lead Capture · Backend (Google Apps Script)
 *
 * ONE-TIME INSTALL
 *   1. Open the Google Sheet → Extensions → Apps Script.
 *   2. Delete everything in Code.gs, paste this whole file, click Save (💾).
 *   3. Deploy → New deployment → ⚙ Web app →
 *        Execute as: Me   ·   Who has access: Anyone   → Deploy → allow access.
 *   4. Copy the "Web app URL" (ends with /exec).
 *   The tabs are created automatically on the first request (or run "setup").
 *
 * AFTER PASTING A NEWER VERSION OF THIS CODE
 *   Deploy → Manage deployments → ✏️ (edit) → Version: "New version" → Deploy.
 *   The URL stays the same.
 ******************************************************************************/

var APP_VERSION = '1.2.0';
var SHEET_ID = '1ELfScsW78vcNN57lqePrrcCOu9e_HnqQuavI-wQ5tx4'; // the Google Sheet used as the database
var TZ = 'Asia/Dubai';

var T = {
  SETTINGS: 'Settings', ADMINS: 'Admins', AGENTS: 'Agents', QUESTIONS: 'Questions',
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
  Admins: [
    ['name', 'Admin Name', 220, 'Name of the person who can open the admin dashboard.'],
    ['pin', 'PIN', 110, 'PIN (at least 4 digits) to open the admin dashboard. Every admin needs a different PIN.'],
    ['active', 'Active', 90, 'Yes = can open the dashboard. No = blocked.']
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
  ['name', 'Client Name', 180], ['phone', 'Phone', 150], ['email', 'Email', 200],
  ['status', 'Status', 150], ['invitedAt', 'Invited At', 140], ['confirmedAt', 'Confirmed At', 140],
  ['formAt', 'Form Done At', 140], ['liked', 'Liked Units', 320]
];
var LEAD_DATES = ['time', 'invitedAt', 'confirmedAt', 'formAt'];

// Settings rows: [name, default value, help]. Missing rows are added automatically.
function settingsRows_() {
  return [
    ['Event Name', 'KATAL Property Roadshow', 'Shown at the top of the app.'],
    ['Default Country Code', '+971', 'Country code selected by default on the phone field.'],
    ['List 1 Name', 'My Leads', 'Name of the list of new leads (added, not confirmed yet).'],
    ['List 2 Name', 'Confirmed Guests', 'Name of the list of leads who confirmed they are coming to the event.'],
    ['List 3 Name', 'Final Leads', 'Name of the list of leads who answered the form.'],
    ['Invitation Link', 'https://orwaaah.github.io/invitation-/', 'The "Send invitation" button opens this link. {name} in the link is replaced by the client name.']
  ];
}
var LEAD_RAW = 'Raw JSON';

/* ================================== SETUP ================================== */

/**
 * Run this once from the Apps Script editor (select "setup" → Run).
 * Safe to run again: it never deletes your data. It only adds missing tabs/columns.
 */
function setup() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet: Extensions → Apps Script.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  secret_();
  try { ss.setSpreadsheetTimeZone(TZ); } catch (e) { /* ignore */ }

  var legacyPin = legacyAdminPin_(ss);
  setupTab_(ss, T.SETTINGS, settingsRows_());
  migrateSettings_(ss);
  setupTab_(ss, T.ADMINS, [['Main Admin', legacyPin || String(Math.floor(100000 + Math.random() * 900000)), 'Yes']]);
  removeSetting_(ss, 'Admin PIN');
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
  dropdown_(ss, T.ADMINS, 'active', yn);
  dropdown_(ss, T.QUESTIONS, 'type', TYPE_NAMES);
  dropdown_(ss, T.QUESTIONS, 'skippable', yn);
  dropdown_(ss, T.QUESTIONS, 'active', yn);
  dropdown_(ss, T.QUESTIONS, 'dashboard', yn);
  dropdown_(ss, T.QUESTIONS, 'matchField', MATCH_NAMES);
  dropdown_(ss, T.PROJECTS, 'active', yn);
  dropdown_(ss, T.UNITS, 'available', yn);

  // Tab order
  [T.SETTINGS, T.ADMINS, T.AGENTS, T.QUESTIONS, T.PROJECTS, T.UNITS, T.LEADS, T.NOTES].forEach(function (name, i) {
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

  var firstAdmin = getAdmins_()[0];
  var msg = 'Setup complete ✅  Admin PIN: ' + (firstAdmin ? firstAdmin.pin : '?') + '  (change it in the Admins tab or the dashboard).';
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
  var textCols = { Settings: ['value'], Agents: ['pin'], Admins: ['pin'], Projects: ['handover', 'paymentPlan'], Questions: ['id', 'options', 'showIfAnswers'], Units: ['unitType'] }[name] || [];
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

/** Admin PIN used to live in the Settings tab (v1.0–1.1). */
function legacyAdminPin_(ss) {
  var sh = ss.getSheetByName(T.SETTINGS);
  if (!sh || sh.getLastRow() < 2) return '';
  var vals = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (var i = 1; i < vals.length; i++) if (norm_(vals[i][0]) === 'adminpin') return text_(vals[i][1]);
  return '';
}

function removeSetting_(ss, key) {
  var sh = ss.getSheetByName(T.SETTINGS);
  if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = vals.length - 1; i >= 1; i--) if (norm_(vals[i][0]) === norm_(key)) sh.deleteRow(i + 1);
}

function migrateSettings_(ss) {
  var sh = ss.getSheetByName(T.SETTINGS);
  var t = readTable_(T.SETTINGS);
  var have = {};
  t.rows.forEach(function (r) { have[norm_(r.key)] = true; });
  var width = Math.max(sh.getLastColumn(), 3);
  settingsRows_().forEach(function (row) {
    if (have[norm_(row[0])]) return;
    var out = [];
    for (var i = 0; i < width; i++) out.push('');
    out[t.map.key] = row[0];
    out[t.map.value] = row[1];
    if (t.map.help >= 0) out[t.map.help] = row[2];
    var r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, width).setNumberFormat('@');
    sh.getRange(r, 1, 1, width).setValues([out]);
  });
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

/** Builds the tabs automatically the first time the app is used (no need to run setup by hand). */
function ensureSetup_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_DONE') === APP_VERSION) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    if (props.getProperty('SETUP_DONE') === APP_VERSION) return;
    setup(); // safe to re-run: only adds what is missing
    props.setProperty('SETUP_DONE', APP_VERSION);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try { ensureSetup_(); } catch (err) { return out_({ ok: false, error: String(err && err.message || err), code: 'SETUP' }); }
  var p = (e && e.parameter) || {};
  if (p.action === 'agents') return out_(safe_(function () { return apiAgents_(); }));
  return out_({ ok: true, app: 'KATAL Roadshow API', version: APP_VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  return out_(safe_(function () {
    ensureSetup_();
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
      updateLead: apiUpdateLead_,
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
  var match = null;
  getAdmins_().forEach(function (a) { if (!match && a.active && pinEq_(a.pin, pin)) match = a; });
  if (!match) {
    throttleFail_('admin');
    throw fail_('Wrong admin PIN', 'BAD_PIN');
  }
  throttleClear_('admin');
  return { ok: true, token: adminToken_(match), admin: match.name };
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
    lists: s.lists,
    invitationLink: s.invitationLink,
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
  var created = when_(L.createdAt) || new Date();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(T.LEADS);
    var headers = ensureLeadColumns_(sh);
    var idx = leadIdx_(headers);
    if (findRow_(sh, idx.id, id) > 0) return { ok: true, id: id, duplicate: true };
    var raw = {
      v: 2, id: id, createdAt: created.toISOString(), receivedAt: new Date().toISOString(),
      agent: ag.name, name: name, phone: phone, email: clip_(L.email, 200),
      invitedAt: isoOrEmpty_(L.invitedAt), confirmedAt: isoOrEmpty_(L.confirmedAt), formAt: isoOrEmpty_(L.formAt),
      answers: cleanAnswers_(L.answers), liked: cleanList_(L.liked), device: clip_(L.device, 200)
    };
    if (raw.answers.length && !raw.formAt) raw.formAt = raw.createdAt;
    writeLeadRow_(sh, sh.getLastRow() + 1, headers, idx, raw, null, true);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

/** Changes an existing lead. patch may contain: name, phone, email, invitedAt, confirmedAt, formAt, answers, liked. */
function apiUpdateLead_(req) {
  var ag = requireAgent_(req.token);
  var id = String(req.leadId || '').trim();
  var patch = req.patch || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = sheet_(T.LEADS);
    var headers = ensureLeadColumns_(sh);
    var idx = leadIdx_(headers);
    var r = findRow_(sh, idx.id, id);
    if (r < 0) throw fail_('Lead not found yet', 'LEAD_NOT_FOUND');
    var row = sh.getRange(r, 1, 1, headers.length).getValues()[0];
    if (!sameName_(row[idx.agent], ag.name)) throw fail_('Not your lead', 'FORBIDDEN');
    var raw = (idx.raw >= 0 ? parseJson_(row[idx.raw]) : null) || {};
    // start from what the sheet shows (the admin may have edited cells)
    raw.id = id;
    raw.agent = String(row[idx.agent]);
    raw.name = String(row[idx.name] || raw.name || '');
    raw.phone = String(row[idx.phone] || raw.phone || '');
    if (idx.email >= 0) raw.email = String(row[idx.email] || '');
    LEAD_DATES.forEach(function (k) {
      if (idx[k] >= 0 && k !== 'time') raw[k] = row[idx[k]] instanceof Date ? row[idx[k]].toISOString() : (raw[k] || '');
    });
    if (idx.time >= 0 && row[idx.time] instanceof Date) raw.createdAt = row[idx.time].toISOString();
    if (patch.name != null && clip_(patch.name, 200)) raw.name = clip_(patch.name, 200);
    if (patch.phone != null && digits_(patch.phone).length >= 6) raw.phone = clip_(patch.phone, 40);
    if (patch.email != null) raw.email = clip_(patch.email, 200);
    ['invitedAt', 'confirmedAt', 'formAt'].forEach(function (k) {
      if (patch[k] !== undefined) raw[k] = isoOrEmpty_(patch[k]);
    });
    var answersChanged = patch.answers !== undefined;
    if (answersChanged) {
      raw.answers = cleanAnswers_(patch.answers);
      if (!raw.formAt) raw.formAt = new Date().toISOString();
    }
    if (patch.liked !== undefined) raw.liked = cleanList_(patch.liked);
    raw.updatedAt = new Date().toISOString();
    writeLeadRow_(sh, r, headers, idx, raw, row, answersChanged);
    return { ok: true };
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
  return apiUpdateLead_({ token: req.token, leadId: req.leadId, patch: { liked: req.liked || [] } });
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
    lists: getSettings_().lists,
    leads: leads,
    columns: t.labelCols,
    questions: getQuestions_(true),
    agents: getAgents_().map(function (a) { return { name: a.name, active: a.active }; })
  };
}

function apiAdminData_(req) {
  requireAdmin_(req.token);
  var tabs = {};
  EDITABLE_.forEach(function (name) {
    tabs[name] = readTable_(name).rows.map(function (r) {
      var o = {};
      COLS[name].forEach(function (c) { o[c[0]] = cellOut_(r[c[0]]); });
      return o;
    });
  });
  return { ok: true, tabs: tabs, types: TYPE_NAMES, matchFields: MATCH_NAMES };
}

var EDITABLE_ = ['Settings', 'Admins', 'Agents', 'Questions', 'Projects', 'Units'];

function apiAdminSave_(req) {
  var me = requireAdmin_(req.token);
  var tab = String(req.tab || '');
  if (EDITABLE_.indexOf(tab) < 0) throw fail_('Unknown tab', 'BAD_REQUEST');
  var rows = (Array.isArray(req.rows) ? req.rows : []).slice(0, 2000);
  validateRows_(tab, rows);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    writeTable_(tab, rows);
    (Array.isArray(req.renames) ? req.renames : []).forEach(function (rn) {
      var from = clip_(rn.from, 200), to = clip_(rn.to, 200);
      if (!from || !to || from === to) return;
      if (tab === T.AGENTS) { renameLeadsCol_('agent', from, to); renameTableCol_(T.NOTES, 'agent', from, to); }
      if (tab === T.PROJECTS) renameTableCol_(T.UNITS, 'project', from, to);
    });
    if (tab === T.QUESTIONS) ensureLeadColumns_(sheet_(T.LEADS));
    var res = { ok: true };
    if (tab === T.ADMINS) {
      var self = findAdmin_(req.selfName || me.name);
      if (self && self.active) res.token = adminToken_(self);
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

function validateRows_(tab, rows) {
  var seen = {};
  var need = function (cond, msg) { if (!cond) throw fail_(msg, 'INVALID'); };
  rows.forEach(function (r) {
    if (tab === T.AGENTS) {
      var n = clip_(r.name, 200);
      need(n, 'Every agent needs a name.');
      need(/^\d{4}$/.test(String(r.pin || '').trim()), 'Agent PIN must be exactly 4 digits (' + n + ').');
      need(!seen[n.toLowerCase()], 'Two agents have the same name: ' + n);
      seen[n.toLowerCase()] = true;
    } else if (tab === T.ADMINS) {
      var an = clip_(r.name, 200);
      var ap = String(r.pin || '').trim();
      need(an, 'Every admin needs a name.');
      need(/^\d{4,12}$/.test(ap), 'Admin PIN must be 4 to 12 digits (' + an + ').');
      need(!seen['n:' + an.toLowerCase()], 'Two admins have the same name: ' + an);
      need(!seen['p:' + normPin_(ap)], 'Two admins have the same PIN. Every admin needs a different PIN.');
      seen['n:' + an.toLowerCase()] = true;
      seen['p:' + normPin_(ap)] = true;
    } else if (tab === T.QUESTIONS) {
      need(clip_(r.text, 500), 'Every question needs text.');
    } else if (tab === T.PROJECTS) {
      var pn = clip_(r.name, 200);
      need(pn, 'Every project needs a name.');
      need(!seen[pn.toLowerCase()], 'Two projects have the same name: ' + pn);
      seen[pn.toLowerCase()] = true;
    } else if (tab === T.UNITS) {
      need(clip_(r.project, 200), 'Every unit needs a project.');
    }
  });
  if (tab === T.ADMINS) need(rows.some(function (r) { return yes_(r.active, true); }), 'At least one admin must stay active.');
}

function renameLeadsCol_(key, from, to) {
  var sh = sheet_(T.LEADS);
  var idx = leadIdx_(headerRow_(sh));
  renameCol_(sh, idx[key], from, to);
}

function renameTableCol_(tab, key, from, to) {
  var t = readTable_(tab);
  renameCol_(t.sheet, t.map[key], from, to);
}

function renameCol_(sh, colIdx, from, to) {
  var last = sh.getLastRow();
  if (colIdx < 0 || last < 2) return;
  var range = sh.getRange(2, colIdx + 1, last - 1, 1);
  var vals = range.getValues();
  var changed = false;
  vals.forEach(function (v) { if (sameName_(v[0], from)) { v[0] = to; changed = true; } });
  if (changed) { range.setNumberFormat('@'); range.setValues(vals); }
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

function adminToken_(ad) {
  return 'x:' + encodeURIComponent(ad.name) + ':' + sign_('x|' + ad.name.toLowerCase() + '|' + normPin_(ad.pin));
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
  if (t.kind !== 'x') throw fail_('Please log in again', 'AUTH');
  var ad = findAdmin_(t.name);
  if (!ad || !ad.active || adminToken_(ad) !== tok) throw fail_('Please log in again', 'AUTH');
  return { admin: true, name: ad.name };
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
  var id = SHEET_ID || PropertiesService.getScriptProperties().getProperty('SHEET_ID');
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
  var textCols = { Agents: ['pin'], Admins: ['pin'], Settings: ['value'], Projects: ['handover', 'paymentPlan'], Questions: ['id', 'options', 'showIfAnswers'], Units: ['unitType'] }[name] || [];
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
    countryCode: text_(s.defaultcountrycode) || '+971',
    lists: [text_(s.list1name) || 'My Leads', text_(s.list2name) || 'Confirmed Guests', text_(s.list3name) || 'Final Leads'],
    invitationLink: text_(s.invitationlink)
  };
}

function getAgents_() {
  return readTable_(T.AGENTS).rows.map(function (r) {
    return { name: text_(r.name), pin: text_(r.pin), active: yes_(r.active, true) };
  }).filter(function (a) { return a.name; });
}

function getAdmins_() {
  return readTable_(T.ADMINS).rows.map(function (r) {
    return { name: text_(r.name), pin: text_(r.pin), active: yes_(r.active, true) };
  }).filter(function (a) { return a.name && a.pin; });
}

function findAdmin_(name) {
  var n = String(name || '').trim().toLowerCase();
  var all = getAdmins_();
  for (var i = 0; i < all.length; i++) if (all[i].name.toLowerCase() === n) return all[i];
  return null;
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
  // add missing fixed columns (e.g. Email, Status… added in a newer version) right after the previous fixed column
  var prev = -1;
  LEAD_FIXED.forEach(function (c) {
    var cur = mapHeaders_(headers, [c])[c[0]];
    if (cur >= 0) { prev = cur; return; }
    var col = prev + 2; // 1-based position right after the previous fixed column
    sh.insertColumnBefore(col);
    var cell = sh.getRange(1, col);
    cell.setValue(c[1]);
    styleHeader_(cell);
    sh.setColumnWidth(col, c[2]);
    headers.splice(col - 1, 0, c[1]);
    prev = col - 1;
  });
  idx = leadIdx_(headers);
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
  var iso = function (k) {
    if (idx[k] >= 0) return row[idx[k]] instanceof Date ? row[idx[k]].toISOString() : '';
    return raw[k] || '';
  };
  var time = idx.time >= 0 && row[idx.time] instanceof Date ? row[idx.time].toISOString() : (raw.createdAt || '');
  var cells = {};
  t.labelIdx.forEach(function (c) {
    var v = row[c.index];
    cells[c.label] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v == null ? '' : v);
  });
  var likedCell = idx.liked >= 0 ? String(row[idx.liked] || '') : '';
  var lead = {
    id: String(row[idx.id] || raw.id || ''),
    time: time,
    agent: String(idx.agent >= 0 ? row[idx.agent] : raw.agent || ''),
    name: String(idx.name >= 0 ? row[idx.name] : raw.name || ''),
    phone: String(idx.phone >= 0 ? row[idx.phone] : raw.phone || ''),
    email: String(idx.email >= 0 ? row[idx.email] : raw.email || ''),
    invitedAt: iso('invitedAt'),
    confirmedAt: iso('confirmedAt'),
    formAt: iso('formAt'),
    liked: likedCell ? likedCell.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) : (raw.liked || []),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    cells: cells,
    notes: []
  };
  lead.status = statusIndex_(lead);
  return lead;
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

function statusIndex_(raw) {
  if (raw.formAt) return 3;
  if (raw.confirmedAt) return 2;
  return 1;
}

/** Writes one lead (raw object) into row r. Label (question) cells are rebuilt only when answersChanged. */
function writeLeadRow_(sh, r, headers, idx, raw, oldRow, answersChanged) {
  var lists = getSettings_().lists;
  var byLabel = {};
  (raw.answers || []).forEach(function (a) {
    var k = (a.label || a.question || a.id || '').trim().toLowerCase();
    var text = answerText_(a);
    if (!k || text === '') return;
    byLabel[k] = byLabel[k] ? byLabel[k] + ' / ' + text : text;
  });
  var fixedIdx = {};
  Object.keys(idx).forEach(function (k) { if (idx[k] >= 0) fixedIdx[idx[k]] = k; });
  var row = [], formats = [];
  for (var c = 0; c < headers.length; c++) {
    var key = fixedIdx[c];
    var v = '', f = '@';
    if (key === 'id') v = raw.id;
    else if (key === 'time') { v = when_(raw.createdAt) || new Date(); f = 'yyyy-mm-dd hh:mm'; }
    else if (key === 'agent') v = raw.agent;
    else if (key === 'name') v = raw.name;
    else if (key === 'phone') v = raw.phone;
    else if (key === 'email') v = raw.email || '';
    else if (key === 'status') v = lists[statusIndex_(raw) - 1];
    else if (key === 'invitedAt' || key === 'confirmedAt' || key === 'formAt') { v = when_(raw[key]) || ''; f = 'yyyy-mm-dd hh:mm'; }
    else if (key === 'liked') v = (raw.liked || []).join('\n');
    else if (key === 'raw') v = JSON.stringify(raw);
    else {
      var h = String(headers[c]).trim();
      if (answersChanged || !oldRow) v = h ? (byLabel[h.toLowerCase()] || '') : '';
      else { v = oldRow[c]; if (v instanceof Date) f = 'yyyy-mm-dd'; }
    }
    row.push(v);
    formats.push(f);
  }
  var range = sh.getRange(r, 1, 1, headers.length);
  range.setNumberFormats([formats]);
  range.setValues([row]);
}

function cleanAnswers_(list) {
  return (Array.isArray(list) ? list : []).slice(0, 200).map(function (a) {
    return {
      id: clip_(a.id, 40), label: clip_(a.label, 200), question: clip_(a.question, 500),
      type: clip_(a.type, 20), match: clip_(a.match, 20), skipped: !!a.skipped, value: cleanValue_(a.value)
    };
  });
}

function when_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  var d = new Date(v);
  if (isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) return null;
  return d;
}

function isoOrEmpty_(v) {
  var d = when_(v);
  return d ? d.toISOString() : '';
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
