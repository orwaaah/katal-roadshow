// Tests for v1.1 (lead statuses, updateLead, migration from v1 layout): node dev/test-v11.js
const assert = require('assert');
const { makeContext } = require('./gas-mock');

const state = { quiet: true };
const G = makeContext(state);
const call = (action, data) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ action }, data)) } }).getContent());
const sheet = n => state.ss.getSheetByName(n);

// ---- migration: simulate a v1 sheet with one old lead
G.setup();
const L = sheet('Leads');
const oldHeaders = ['Lead ID', 'Time', 'Agent', 'Client Name', 'Phone', 'Liked Units', 'Purpose', 'Unit type', 'Budget (AED)', 'Raw JSON'];
L.data = [oldHeaders, ['L-OLD-000001', require('vm').runInContext('new Date()', G), 'Test Agent 1', 'Old Client', '+971500000001', '', 'Investment', '2BR', 'Up to 1', '{"id":"L-OLD-000001","answers":[]}']];
L.fmt = {};
const st = sheet('Settings');
st.data = st.data.slice(0, 4); // only the 3 v1 settings
state.props.SETUP_DONE = '1.0.0';

let r = call('agents');
assert.ok(r.ok, JSON.stringify(r));
const H = L.data[0];
console.log('migrated headers:', H.join(' | '));
assert.deepStrictEqual(H.slice(0, 11), ['Lead ID', 'Time', 'Agent', 'Client Name', 'Phone', 'Email', 'Status', 'Invited At', 'Confirmed At', 'Form Done At', 'Liked Units']);
assert.strictEqual(H[H.length - 1], 'Raw JSON');
const old = L.data[1];
assert.strictEqual(old[H.indexOf('Client Name')], 'Old Client');
assert.strictEqual(old[H.indexOf('Unit type')], '2BR');
assert.strictEqual(old[H.indexOf('Purpose')], 'Investment');
assert.ok(H.includes('Reserve during roadshow'), 'question columns added');
assert.strictEqual(st.data.length, 8, 'settings migrated');
assert.strictEqual(st.data[7][0], 'Invitation Link');

const tok = call('login', { name: 'Test Agent 1', pin: '1111' }).token;
const tok2 = call('login', { name: 'Test Agent 2', pin: '2222' }).token;
r = call('config', { token: tok });
assert.deepStrictEqual(r.lists, ['My Leads', 'Confirmed Guests', 'Final Leads']);
assert.ok(r.invitationLink.startsWith('https://'));

// ---- quick add (no answers)
r = call('saveLead', { token: tok, lead: { id: 'L-NEW-000001', createdAt: new Date().toISOString(), name: 'Sara', phone: '+971501112222', email: 'sara@example.com' } });
assert.ok(r.ok, JSON.stringify(r));
const col = (rowIdx, name) => L.data[rowIdx][L.data[0].indexOf(name)];
assert.strictEqual(col(2, 'Status'), 'My Leads');
assert.strictEqual(col(2, 'Email'), 'sara@example.com');
assert.strictEqual(col(2, 'Invited At'), '');

// ---- invite + confirm
const now = new Date().toISOString();
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { invitedAt: now } }).ok);
assert.ok(Object.prototype.toString.call(col(2, 'Invited At')) === '[object Date]');
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { confirmedAt: now } }).ok);
assert.strictEqual(col(2, 'Status'), 'Confirmed Guests');
assert.strictEqual(call('updateLead', { token: tok2, leadId: 'L-NEW-000001', patch: { confirmedAt: '' } }).code, 'FORBIDDEN');
assert.strictEqual(call('updateLead', { token: tok, leadId: 'L-NOPE-0001', patch: {} }).code, 'LEAD_NOT_FOUND');

// ---- answers → final
const answers = [
  { id: 'Q1', label: 'Purpose', question: 'Purpose?', type: 'single', value: 'Live in it' },
  { id: 'Q3A', label: 'Unit type', question: 'Unit?', type: 'single', match: 'unitType', value: '1BR' },
  { id: 'Q11', label: 'Budget (AED)', question: 'Budget', type: 'range', match: 'budget', value: { max: 1500000 } }
];
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { answers, formAt: now } }).ok);
assert.strictEqual(col(2, 'Status'), 'Final Leads');
assert.strictEqual(col(2, 'Unit type'), '1BR');
assert.strictEqual(col(2, 'Budget (AED)'), 'Up to 1,500,000');
assert.strictEqual(col(2, 'Email'), 'sara@example.com', 'email kept');

// admin edits a cell by hand → kept when only status changes
L.data[2][L.data[0].indexOf('Purpose')] = 'Investment (edited)';
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { liked: ['SAMPLE – Coral Bay Residences · 1BR Apartment'] } }).ok);
assert.strictEqual(col(2, 'Purpose'), 'Investment (edited)');
assert.strictEqual(col(2, 'Liked Units'), 'SAMPLE – Coral Bay Residences · 1BR Apartment');

// re-answer → old answers replaced
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { answers: [answers[0]] } }).ok);
assert.strictEqual(col(2, 'Unit type'), '');
assert.strictEqual(col(2, 'Purpose'), 'Live in it');

// undo confirm keeps final (form done)
assert.ok(call('updateLead', { token: tok, leadId: 'L-NEW-000001', patch: { confirmedAt: '' } }).ok);
assert.strictEqual(col(2, 'Status'), 'Final Leads');

// ---- myLeads / dashboard
r = call('myLeads', { token: tok });
const sara = r.leads.find(l => l.id === 'L-NEW-000001');
assert.strictEqual(sara.status, 3);
assert.strictEqual(sara.email, 'sara@example.com');
assert.ok(sara.invitedAt && sara.formAt);
assert.strictEqual(sara.confirmedAt, '');
const oldLead = r.leads.find(l => l.id === 'L-OLD-000001');
assert.strictEqual(oldLead.status, 1);
const pin = st.data[2][1];
const at = call('adminLogin', { pin }).token;
r = call('dashboard', { token: at });
assert.ok(r.ok && r.leads.length === 2 && r.lists.length === 3);

// ---- note on a lead
assert.ok(call('addNote', { token: tok, noteId: 'N-NEW-000001', leadId: 'L-NEW-000001', text: 'Wants sea view' }).ok);
r = call('myLeads', { token: tok });
assert.strictEqual(r.leads.find(l => l.id === 'L-NEW-000001').notes[0].text, 'Wants sea view');

console.log('✅ v1.1 tests passed');
