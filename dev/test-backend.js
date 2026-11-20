// Backend tests: node dev/test-backend.js
const assert = require('assert');
const { makeContext } = require('./gas-mock');

const state = { quiet: true };
const G = makeContext(state);
const call = (action, data) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ action }, data)) } }).getContent());
const sheet = n => state.ss.getSheetByName(n);

// setup twice (second run must not duplicate anything)
G.setup();
G.setup();
assert.deepStrictEqual(state.ss.getSheets().map(s => s.name), ['Settings', 'Agents', 'Questions', 'Projects', 'Units', 'Leads', 'Notes']);
assert.strictEqual(sheet('Questions').getLastRow(), 17);
assert.strictEqual(sheet('Agents').getLastRow(), 4);
const leadHeaders = sheet('Leads').data[0];
console.log('Leads headers:', leadHeaders.join(' | '));
assert.strictEqual(leadHeaders.filter(h => h === 'Unit type').length, 1, 'Unit type shares one column');
assert.strictEqual(leadHeaders[leadHeaders.length - 1], 'Raw JSON');

// public agents
let r = call('agents');
assert.ok(r.ok); assert.deepStrictEqual(r.agents, ['Test Agent 1', 'Test Agent 2', 'Test Agent 3']);

// login
assert.strictEqual(call('login', { name: 'Test Agent 1', pin: '9999' }).code, 'BAD_PIN');
r = call('login', { name: 'test agent 1', pin: '1111' });
assert.ok(r.ok, JSON.stringify(r)); const tok1 = r.token;
const tok2 = call('login', { name: 'Test Agent 2', pin: '2222' }).token;
assert.strictEqual(call('config', { token: 'garbage' }).code, 'AUTH');

// config
r = call('config', { token: tok1 });
assert.ok(r.ok);
assert.strictEqual(r.questions.length, 16);
assert.deepStrictEqual(r.questions[2].showIf, { id: 'Q2', answers: ['Apartment', 'Penthouse'] });
assert.strictEqual(r.questions[14].maxPicks, 3);
assert.strictEqual(r.questions[14].type, 'multi');
assert.strictEqual(r.questions[12].type, 'range');
assert.strictEqual(r.questions[11].type, 'project');
assert.strictEqual(r.units.length, 12, 'unavailable unit hidden');
assert.strictEqual(r.units[0].location, 'Abu Dhabi');
assert.strictEqual(r.countryCode, '+971');

// save lead
const lead = {
  id: 'L-test-0001', createdAt: new Date().toISOString(), name: 'John Client', phone: '+971501234567',
  answers: [
    { id: 'Q1', label: 'Purpose', question: 'What is the purpose of buying?', type: 'single', value: 'Investment' },
    { id: 'Q3A', label: 'Unit type', question: 'Which unit type?', type: 'single', value: '2BR' },
    { id: 'Q7', label: 'Bought off-plan before', question: '?', type: 'single', skipped: true },
    { id: 'Q11', label: 'Budget (AED)', question: 'Budget', type: 'range', value: { min: 1000000, max: 2000000 } },
    { id: 'Q13', label: 'Top priorities', question: 'Top 3', type: 'multi', value: ['Price', 'View'] },
    { id: 'Q99', label: '=HACK()', question: 'x', type: 'text', value: '=IMPORTXML("x")' }
  ]
};
r = call('saveLead', { token: tok1, lead });
assert.ok(r.ok, JSON.stringify(r));
r = call('saveLead', { token: tok1, lead });
assert.ok(r.duplicate, 'idempotent');
assert.strictEqual(sheet('Leads').getLastRow(), 2);
const H = sheet('Leads').data[0];
const row = sheet('Leads').data[1];
const col = n => row[H.indexOf(n)];
assert.strictEqual(col('Phone'), '+971501234567', 'phone kept as text');
assert.strictEqual(col('Unit type'), '2BR');
assert.strictEqual(col('Budget (AED)'), '1,000,000 – 2,000,000');
assert.strictEqual(col('Bought off-plan before'), 'Skipped');
assert.strictEqual(col('Top priorities'), 'Price, View');
assert.strictEqual(col('Agent'), 'Test Agent 1');
assert.ok(Object.prototype.toString.call(col('Time')) === '[object Date]');
assert.ok(JSON.parse(col('Raw JSON')).answers.length === 6);

// second agent lead
call('saveLead', { token: tok2, lead: Object.assign({}, lead, { id: 'L-test-0002', name: 'Agent2 Client', phone: '+971509999999' }) });

// phone check
r = call('checkPhone', { token: tok2, phone: '+971 50 123 4567' });
assert.ok(r.exists && !r.mine);
r = call('checkPhone', { token: tok1, phone: '971501234567' });
assert.ok(r.exists && r.mine);
assert.ok(!call('checkPhone', { token: tok1, phone: '+971500000000' }).exists);

// my leads isolation
r = call('myLeads', { token: tok1 });
assert.strictEqual(r.leads.length, 1); assert.strictEqual(r.leads[0].name, 'John Client');
r = call('myLeads', { token: tok2 });
assert.strictEqual(r.leads.length, 1); assert.strictEqual(r.leads[0].name, 'Agent2 Client');

// liked + notes, ownership
assert.strictEqual(call('setLiked', { token: tok2, leadId: 'L-test-0001', liked: ['x'] }).code, 'FORBIDDEN');
assert.strictEqual(call('setLiked', { token: tok1, leadId: 'L-missing', liked: ['x'] }).code, 'LEAD_NOT_FOUND');
assert.ok(call('setLiked', { token: tok1, leadId: 'L-test-0001', liked: ['SAMPLE – Marina Heights · 2BR Apartment'] }).ok);
assert.ok(call('addNote', { token: tok1, noteId: 'N-test-0001', leadId: 'L-test-0001', text: 'Call back Sunday' }).ok);
assert.ok(call('addNote', { token: tok1, noteId: 'N-test-0001', leadId: 'L-test-0001', text: 'Call back Sunday' }).duplicate);
assert.strictEqual(call('addNote', { token: tok2, noteId: 'N-test-0002', leadId: 'L-test-0001', text: 'x' }).code, 'FORBIDDEN');
r = call('myLeads', { token: tok1 });
assert.deepStrictEqual(r.leads[0].liked, ['SAMPLE – Marina Heights · 2BR Apartment']);
assert.strictEqual(r.leads[0].notes.length, 1);
assert.strictEqual(r.leads[0].notes[0].text, 'Call back Sunday');

// new question → new Leads column inserted before Raw JSON
const q = sheet('Questions');
q.set(18, 2, 17); q.set(18, 3, 'How did you hear about us?'); q.set(18, 4, 'Source'); q.set(18, 5, 'Short text');
r = call('config', { token: tok1 });
assert.strictEqual(r.questions[16].id, 'Q15', 'auto id');
call('saveLead', { token: tok1, lead: Object.assign({}, lead, { id: 'L-test-0003', answers: [{ id: 'Q15', label: 'Source', type: 'text', value: 'Instagram' }] }) });
const H2 = sheet('Leads').data[0];
assert.strictEqual(H2[H2.length - 1], 'Raw JSON');
assert.strictEqual(H2[H2.length - 2], 'Source');
assert.strictEqual(sheet('Leads').data[3][H2.indexOf('Source')], 'Instagram');
assert.strictEqual(sheet('Leads').data[1][H2.indexOf('Raw JSON')].slice(0, 1), '{', 'old rows shifted with the column');

// PIN change invalidates token
sheet('Agents').set(2, 2, '4444');
assert.strictEqual(call('myLeads', { token: tok1 }).code, 'AUTH');

// admin
const adminPin = sheet('Settings').data[2][1];
assert.ok(/^\d{6}$/.test(adminPin), 'random admin pin');
assert.strictEqual(call('adminLogin', { pin: '000000' }).code, 'BAD_PIN');
const at = call('adminLogin', { pin: adminPin }).token;
r = call('dashboard', { token: at });
assert.ok(r.ok); assert.strictEqual(r.leads.length, 3);
assert.strictEqual(call('dashboard', { token: tok2 }).code, 'AUTH');
r = call('adminData', { token: at });
assert.ok(r.ok && r.tabs.Questions.length === 17);
assert.ok(call('config', { token: at }).ok, 'admin can read config');

// throttle
for (let i = 0; i < 6; i++) call('login', { name: 'Test Agent 3', pin: '0000' });
assert.strictEqual(call('login', { name: 'Test Agent 3', pin: '3333' }).code, 'LOCKED');

// leading zero pin
sheet('Agents').set(3, 2, '0123');
assert.ok(call('login', { name: 'Test Agent 2', pin: '0123' }).ok);

console.log('✅ backend tests passed');
