// The cache must never serve stale data after a dashboard save. node dev/test-cache.js
const assert = require('assert');
const { makeContext } = require('./gas-mock');
const state = { quiet: true };
const G = makeContext(state);
const call = (action, data) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ action }, data)) } }).getContent());
let reads = 0;
const orig = G.readTable_;
G.readTable_ = function (n) { reads++; return orig(n); };
call('agents');
const pin = state.ss.getSheetByName('Admins').data[1][1];
const at = call('adminLogin', { pin }).token;
const tok = call('login', { name: 'Test Agent 1', pin: '1111' }).token;
call('config', { token: tok });
reads = 0;
for (let i = 0; i < 5; i++) call('config', { token: tok });
assert.strictEqual(reads, 0, 'config served from cache');
// change a PIN from the dashboard → old token rejected immediately
const ag = call('adminData', { token: at }).tabs.Agents;
ag[0].pin = '9876';
assert.ok(call('adminSave', { token: at, tab: 'Agents', rows: ag }).ok);
assert.strictEqual(call('config', { token: tok }).code, 'AUTH', 'new PIN applies at once');
// rename a list → visible at once
const st = call('adminData', { token: at }).tabs.Settings;
st.forEach(r => { if (r.key === 'List 3 Name') r.value = 'Hot Leads'; });
call('adminSave', { token: at, tab: 'Settings', rows: st });
assert.strictEqual(call('config', { token: at }).lists[2], 'Hot Leads');
console.log('✅ cache tests passed');
// sanity: the counter really sees reads (Notes is never cached)
reads = 0;
call('myLeads', { token: call('login', { name: 'Test Agent 2', pin: '2222' }).token });
assert.ok(reads >= 1, 'read counter works');
console.log('✅ cache sanity passed');
