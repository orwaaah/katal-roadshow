// End-to-end test of the agent app (v1.1 flow) against the local mock: node dev/server.js, then node dev/e2e.js
const { chromium } = require('playwright');
const assert = require('assert');
const SHOTS = process.env.SHOTS || '/tmp/shots';
const BASE = 'http://localhost:8080/?api=http://localhost:8081/exec';
const dump = () => fetch('http://localhost:8081/__dump').then(r => r.json());
const leadRow = (d, name) => { const H = d.Leads[0]; const r = d.Leads.find(x => x[H.indexOf('Client Name')] === name); return r && Object.fromEntries(H.map((h, i) => [h, r[i]])); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  await ctx.route('https://orwaaah.github.io/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Invitation</h1>' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
  const tapOpt = t => page.locator('.opt', { hasText: t }).first().click();
  const qText = () => page.locator('.q-text').textContent();
  const waitQ = re => page.waitForFunction(r => new RegExp(r, 'i').test(document.querySelector('.q-text') && document.querySelector('.q-text').textContent), re.source);

  // login
  await page.goto(BASE);
  await page.locator('.agent-btn', { hasText: 'Test Agent 1' }).click();
  for (const d of '1111') await page.locator(`[data-key="${d}"]`).click();
  await page.locator('.cta-card').waitFor();
  await page.locator('.list-tile').first().waitFor();
  await shot('20-home');

  // quick add lead 1
  await page.locator('.cta-card').click();
  await page.fill('#cName', 'Omar Haddad');
  await page.fill('#cPhone', '050 765 4321');
  await page.fill('#cEmail', 'omar@example.com');
  await shot('21-add');
  await page.locator('#saveBtn').click();
  await page.locator('.done-badge').waitFor();
  await shot('22-added');
  // send invitation opens the invitation page in a new tab
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-act="invite"]').click()]);
  assert.ok(popup.url().startsWith('https://orwaaah.github.io/invitation-/'), popup.url());
  await popup.close();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith('Omar Haddad'), 'name copied');
  // add another
  await page.locator('[data-act="another"]').click();
  await page.fill('#cName', 'Lina Saleh');
  await page.fill('#cPhone', '0501112233');
  await page.locator('#saveBtn').click();
  await page.locator('.done-badge').waitFor();
  await page.locator('[data-act="home"]').click();
  await page.waitForFunction(() => /All synced/.test(document.querySelector('.pill').textContent), null, { timeout: 15000 }).catch(async e => {
    console.log('pill:', await page.locator('.pill').textContent());
    console.log('outbox:', await page.evaluate(() => localStorage.getItem('katal.outbox')));
    throw e;
  });
  let d = await dump();
  let omar = leadRow(d, 'Omar Haddad');
  assert.ok(omar, 'omar saved');
  assert.strictEqual(omar['Phone'], '+971507654321');
  assert.strictEqual(omar['Email'], 'omar@example.com');
  assert.strictEqual(omar['Status'], 'My Leads');
  assert.ok(omar['Invited At'], 'invited at set');
  console.log('quick add + invite OK');

  // lists → open Omar → confirm
  await page.locator('.list-tile[data-tab="1"]').click();
  await page.locator('.lead-row', { hasText: 'Omar Haddad' }).waitFor();
  await shot('23-list1');
  await page.locator('.lead-row', { hasText: 'Omar Haddad' }).locator('.lr-main').click();
  await page.locator('[data-act="confirm"]').waitFor();
  await shot('24-lead-new');
  await page.locator('[data-act="confirm"]').click();
  await page.locator('.chip.s2').first().waitFor();
  await page.locator('[data-act="back"]').click();
  await page.locator('.seg-btn.on', { hasText: 'Confirmed Guests' }).waitFor();
  await shot('25-list2');

  // search by phone in list 2
  await page.fill('#q', '7654');
  await page.locator('.list-note', { hasText: '1 result' }).waitFor();
  await shot('26-search');
  await page.locator('.lead-row', { hasText: 'Omar' }).locator('[data-row-act="form"]').click();

  // form: villa path, skip optional, finish
  await waitQ(/purpose/);
  assert.match(await page.locator('.eyebrow').first().textContent(), /Omar Haddad/);
  await tapOpt('Investment');
  await waitQ(/property type/);
  await tapOpt('Villa');
  await page.waitForFunction(() => document.querySelectorAll('.opt').length === 3);
  await tapOpt('4BR');
  await waitQ(/location/);
  await tapOpt('Dubai');
  for (let i = 0; i < 20; i++) {
    const t = (await qText()).toLowerCase();
    const btn = await page.locator('#nextBtn').textContent();
    if (t.includes('reserving')) { await tapOpt('Yes'); assert.strictEqual(await page.locator('#nextBtn').textContent(), 'Save answers'); await shot('27-last-q'); await page.locator('#nextBtn').click(); break; }
    if (await page.locator('[data-act="skip"]').count()) await page.locator('[data-act="skip"]').click();
    else if (t.includes('budget')) { await page.fill('#rMax', '5000000'); await page.locator('#nextBtn').click(); }
    else if (t.includes('aldar project')) await tapOpt('No');
    else await page.locator('.opt').first().click();
    await page.waitForTimeout(300);
  }
  await page.locator('#units .unit').first().waitFor();
  assert.strictEqual(await page.locator('#unitsTitle').textContent(), 'Matching units');
  const firstUnit = (await page.locator('#units .unit .u-proj').first().textContent());
  assert.match(firstUnit, /Palm Grove/);
  assert.match(await page.locator('#units .unit .u-type').first().textContent(), /4BR Villa/);
  await page.locator('#units .unit').first().click();
  await shot('28-matches');
  await page.locator('[data-act="done"]').click();
  await page.locator('.chip.s3').first().waitFor();
  await page.fill('#noteText', 'Wants a corner villa, call Sunday');
  await page.locator('[data-act="note"]').click();
  await page.locator('.notes li').first().waitFor();
  await shot('29-lead-final');
  await page.waitForFunction(() => /All synced/.test(document.querySelector('.pill').textContent), null, { timeout: 20000 });
  d = await dump();
  omar = leadRow(d, 'Omar Haddad');
  assert.strictEqual(omar['Status'], 'Final Leads');
  assert.strictEqual(omar['Unit type'], '4BR');
  assert.strictEqual(omar['Budget (AED)'], 'Up to 5,000,000');
  assert.ok(omar['Confirmed At'] && omar['Form Done At']);
  assert.strictEqual(omar['Liked Units'], 'SAMPLE – Palm Grove Villas · 4BR Villa');
  assert.ok(d.Notes.some(r => r.includes('Wants a corner villa, call Sunday')));
  console.log('confirm + form + liked + note OK');

  // offline: confirm Lina and fill form (walk-in style) with no internet
  await ctx.setOffline(true);
  await page.locator('[data-act="back"]').click();
  await page.locator('.seg-btn[data-tab="1"]').click();
  await page.locator('.lead-row', { hasText: 'Lina Saleh' }).locator('.lr-main').click();
  await page.locator('[data-act="confirm"]').click();
  await page.locator('.chip.s2').first().waitFor();
  await page.locator('[data-act="form"]').first().click();
  await waitQ(/purpose/);
  for (let i = 0; i < 25; i++) {
    if (await page.locator('[data-act="done"]').count()) break;
    const t = (await qText()).toLowerCase();
    if (await page.locator('[data-act="skip"]').count()) await page.locator('[data-act="skip"]').click();
    else if (t.includes('budget')) { await page.fill('#rMin', '1000000'); await page.fill('#rMax', '2000000'); await page.locator('#nextBtn').click(); }
    else if (t.includes('aldar project')) await tapOpt('No');
    else if (t.includes('property type')) await tapOpt('Apartment');
    else if (t.includes('unit type')) await tapOpt('2BR');
    else if (t.includes('location')) await tapOpt('Abu Dhabi');
    else { await page.locator('.opt').first().click(); if ((await page.locator('#nextBtn').textContent()) === 'Save answers') await page.locator('#nextBtn').click(); }
    await page.waitForTimeout(300);
  }
  await page.locator('[data-act="done"]').waitFor();
  assert.match(await page.locator('#units .unit .u-type').first().textContent(), /2BR Apartment/);
  await page.locator('[data-act="done"]').click();
  await page.locator('.pill.is-offline').waitFor();
  await shot('30-offline-lead');
  d = await dump();
  assert.strictEqual(leadRow(d, 'Lina Saleh')['Status'], 'My Leads', 'not synced while offline');
  // reload offline
  await page.reload();
  await page.locator('.cta-card').waitFor();
  assert.match(await page.locator('.pill').textContent(), /pending/);
  // back online
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => /All synced/.test(document.querySelector('.pill').textContent), null, { timeout: 25000 });
  d = await dump();
  const lina = leadRow(d, 'Lina Saleh');
  assert.strictEqual(lina['Status'], 'Final Leads');
  assert.strictEqual(lina['Unit type'], '2BR');
  assert.strictEqual(lina['Budget (AED)'], '1,000,000 – 2,000,000');
  await page.waitForTimeout(800);
  assert.strictEqual(await page.locator('.list-tile[data-tab="3"] b').textContent(), '2');
  await shot('31-home-after');
  console.log('offline flow OK');

  assert.deepStrictEqual(errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(e)), [], 'no JS errors');
  console.log('✅ e2e v1.1 passed');
  await browser.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
