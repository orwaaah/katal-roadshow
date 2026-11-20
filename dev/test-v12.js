// v1.2: admins + editors. node dev/test-v12.js
const assert = require('assert');
const { makeContext } = require('./gas-mock');
const state = { quiet: true };
const G = makeContext(state);
const call = (action, data) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ action }, data)) } }).getContent());
const sheet = n => state.ss.getSheetByName(n);

// migrate a v1.1 sheet: Admin PIN lives in Settings
G.setup();
const st = sheet('Settings');
st.data.splice(2, 0, ['Admin PIN', '972746', 'old']);
state.ss.sheets = state.ss.sheets.filter(s => s.name !== 'Admins');
state.props.SETUP_DONE = '1.1.0';
G.clearCache_();
let r = call('agents');
assert.ok(r.ok);
assert.ok(!st.data.some(row => row[0] === 'Admin PIN'), 'Admin PIN removed from Settings');
assert.deepStrictEqual(sheet('Admins').data[1].slice(0, 3), ['Main Admin', '972746', 'Yes']);
assert.strictEqual(state.ss.sheets[1].name, 'Admins');

// admin login with the migrated PIN
r = call('adminLogin', { pin: '972746' });
assert.ok(r.ok, JSON.stringify(r)); let at = r.token;
assert.strictEqual(r.admin, 'Main Admin');
r = call('adminData', { token: at });
assert.ok(r.ok && r.tabs.Admins.length === 1 && r.tabs.Agents.length === 3 && r.tabs.Questions.length === 16);

// agent with a lead, then rename agent → lead follows
const tok = call('login', { name: 'Test Agent 1', pin: '1111' }).token;
call('saveLead', { token: tok, lead: { id: 'L-REN-000001', name: 'Client X', phone: '+971509990000' } });
call('addNote', { token: tok, noteId: 'N-REN-000001', leadId: 'L-REN-000001', text: 'hi' });
const agents = r.tabs.Agents.map(a => Object.assign({}, a));
agents[0].name = 'Rami Khoury';
agents.push({ name: 'Nour Aziz', pin: '0456', active: 'Yes' });
r = call('adminSave', { token: at, tab: 'Agents', rows: agents, renames: [{ from: 'Test Agent 1', to: 'Rami Khoury' }] });
assert.ok(r.ok, JSON.stringify(r));
const tokR = call('login', { name: 'Rami Khoury', pin: '1111' }).token;
assert.ok(tokR);
r = call('myLeads', { token: tokR });
assert.strictEqual(r.leads.length, 1, 'renamed agent keeps leads');
assert.strictEqual(r.leads[0].notes.length, 1);
assert.ok(call('login', { name: 'Nour Aziz', pin: '0456' }).ok, 'new agent can log in, leading zero kept');

// validation
assert.strictEqual(call('adminSave', { token: at, tab: 'Agents', rows: [{ name: 'A', pin: '12', active: 'Yes' }] }).code, 'INVALID');
assert.strictEqual(call('adminSave', { token: at, tab: 'Agents', rows: [{ name: 'A', pin: '1234' }, { name: 'a', pin: '5678' }] }).code, 'INVALID');
assert.strictEqual(call('adminSave', { token: at, tab: 'Admins', rows: [{ name: 'X', pin: '1234', active: 'No' }] }).code, 'INVALID');
assert.strictEqual(call('adminSave', { token: at, tab: 'Admins', rows: [{ name: 'X', pin: '1234' }, { name: 'Y', pin: '1234' }] }).code, 'INVALID');
assert.strictEqual(call('adminSave', { token: tokR, tab: 'Agents', rows: [] }).code, 'AUTH', 'agents cannot edit');

// admins: add a second admin + change own PIN → new token returned
r = call('adminSave', { token: at, tab: 'Admins', rows: [{ name: 'Orwah', pin: '246810', active: 'Yes' }, { name: 'Main Admin', pin: '135790', active: 'Yes' }], selfName: 'Main Admin' });
assert.ok(r.ok && r.token, JSON.stringify(r));
assert.strictEqual(call('dashboard', { token: at }).code, 'AUTH', 'old token invalid after PIN change');
assert.ok(call('dashboard', { token: r.token }).ok, 'new token works');
at = r.token;
assert.strictEqual(call('adminLogin', { pin: '246810' }).admin, 'Orwah');
assert.strictEqual(sheet('Admins').data[1][1], '246810', 'pin stored as text');

// questions: reorder + new question → new Leads column
let q = call('adminData', { token: at }).tabs.Questions;
const moved = q.splice(4, 1)[0]; // move Location first
q.unshift(moved);
q.push({ id: 'Q15', text: 'How did you hear about us?', label: 'Source', type: 'Multiple choice', options: 'Instagram, Friend, Billboard', maxPicks: '', skippable: 'Yes', showIfId: '', showIfAnswers: '', active: 'Yes', dashboard: 'Yes', matchField: '' });
q = q.map((x, i) => Object.assign(x, { order: i + 1 }));
assert.ok(call('adminSave', { token: at, tab: 'Questions', rows: q }).ok);
r = call('config', { token: tokR });
assert.strictEqual(r.questions[0].id, 'Q4');
assert.strictEqual(r.questions[16].label, 'Source');
assert.deepStrictEqual(r.questions[16].options, ['Instagram', 'Friend', 'Billboard']);
const LH = sheet('Leads').data[0];
assert.strictEqual(LH[LH.length - 2], 'Source');

// projects rename cascades to units
let t = call('adminData', { token: at }).tabs;
t.Projects[0].name = 'Saadiyat Grove';
assert.ok(call('adminSave', { token: at, tab: 'Projects', rows: t.Projects, renames: [{ from: 'SAMPLE – Marina Heights', to: 'Saadiyat Grove' }] }).ok);
r = call('config', { token: tokR });
assert.strictEqual(r.units.filter(u => u.project === 'Saadiyat Grove').length, 5);

// settings save
t = call('adminData', { token: at }).tabs;
t.Settings.forEach(x => { if (x.key === 'List 2 Name') x.value = 'Coming to the Event'; });
assert.ok(call('adminSave', { token: at, tab: 'Settings', rows: t.Settings }).ok);
assert.strictEqual(call('config', { token: tokR }).lists[1], 'Coming to the Event');
assert.strictEqual(call('config', { token: tokR }).invitationLink, 'https://orwaaah.github.io/invitation-/');

console.log('✅ v1.2 tests passed');

// ---- v1.3: an admin can work as an agent with the admin token
(function () {
  const adm = call('adminLogin', { pin: '246810' });
  assert.strictEqual(adm.admin, 'Orwah');
  assert.ok(call('config', { token: adm.token }).ok);
  assert.ok(call('saveLead', { token: adm.token, lead: { id: 'L-ADM-000001', name: 'VIP Client', phone: '+971501230000' } }).ok);
  assert.ok(call('updateLead', { token: adm.token, leadId: 'L-ADM-000001', patch: { confirmedAt: new Date().toISOString() } }).ok);
  const mine = call('myLeads', { token: adm.token });
  assert.strictEqual(mine.leads.length, 1);
  assert.strictEqual(mine.leads[0].agent, 'Orwah');
  const d = call('dashboard', { token: adm.token });
  assert.ok(d.leads.some(l => l.agent === 'Orwah' && l.status === 2));
  assert.ok(d.admins.includes('Orwah'));
  // a real agent cannot touch the admin's lead
  const tok = call('login', { name: 'Rami Khoury', pin: '1111' }).token;
  assert.strictEqual(call('updateLead', { token: tok, leadId: 'L-ADM-000001', patch: { confirmedAt: '' } }).code, 'FORBIDDEN');
  console.log('✅ v1.3 admin-as-agent passed');
})();
