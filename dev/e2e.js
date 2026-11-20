// End-to-end test of the agent app against the local mock (node dev/server.js must be running).
const { chromium } = require('playwright');
const assert = require('assert');
const SHOTS = process.env.SHOTS || '/tmp/shots';
const BASE = 'http://localhost:8080/?api=http://localhost:8081/exec';
const dump = () => fetch('http://localhost:8081/__dump').then(r => r.json());

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
  const tapOpt = t => page.locator('.opt', { hasText: t }).first().click();
  const qText = () => page.locator('.q-text').textContent();

  await page.goto(BASE);
  await page.locator('.agent-btn', { hasText: 'Test Agent 1' }).waitFor();
  await shot('01-login');
  await page.locator('.agent-btn', { hasText: 'Test Agent 1' }).click();
  await shot('02-pin');
  for (const d of '1112') await page.locator(`[data-key="${d}"]`).click();
  await page.locator('.pin-msg', { hasText: 'Wrong PIN' }).waitFor();
  for (const d of '1111') await page.locator(`[data-key="${d}"]`).click();
  await page.locator('.cta-card').waitFor();
  await page.locator('.cta-sub', { hasText: 'Start a new' }).waitFor();
  await shot('03-home');

  // ---- lead 1 (online): villa path
  await page.locator('.cta-card').click();
  assert.match(await qText(), /purpose/i);
  await shot('04-q1');
  await tapOpt('Investment');
  await page.waitForFunction(() => /property type/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Villa');
  await page.waitForFunction(() => /unit type/i.test(document.querySelector('.q-text').textContent));
  const opts = await page.locator('.opt').allTextContents();
  assert.deepStrictEqual(opts.map(s => s.trim()), ['3BR', '4BR', '5BR+'], 'villa branch shows Q3B');
  // back → change to Apartment → Q3A
  await page.locator('[data-act="back"]').click();
  await page.waitForFunction(() => /property type/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Apartment');
  await page.waitForFunction(() => document.querySelectorAll('.opt').length === 5);
  await page.locator('[data-act="back"]').click();
  await page.waitForFunction(() => /property type/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Villa');
  await page.waitForFunction(() => document.querySelectorAll('.opt').length === 3);
  await tapOpt('4BR');
  await page.waitForFunction(() => /location/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Dubai');
  await page.waitForFunction(() => /planning/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Today');
  await page.waitForFunction(() => /main interest/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Lifestyle');
  await page.waitForFunction(() => /off-plan/i.test(document.querySelector('.q-text').textContent));
  await shot('05-skippable');
  await page.locator('[data-act="skip"]').click();
  await page.waitForFunction(() => /own a unit/i.test(document.querySelector('.q-text').textContent));
  await page.locator('[data-act="skip"]').click();
  await page.waitForFunction(() => /looking for/i.test(document.querySelector('.q-text').textContent));
  assert.strictEqual(await page.locator('[data-act="skip"]').count(), 0, 'no skip on required');
  await tapOpt('One unit');
  await page.waitForFunction(() => /current aldar project/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Yes');
  await page.waitForFunction(() => /which project/i.test(document.querySelector('.q-text').textContent));
  await shot('06-project');
  await tapOpt('Palm Grove');
  await page.waitForFunction(() => /budget/i.test(document.querySelector('.q-text').textContent));
  assert.ok(await page.locator('#nextBtn').isDisabled());
  await page.fill('#rMin', '5000000');
  await page.fill('#rMax', '3000000');
  await page.locator('#nextBtn').click();
  await page.locator('#qErr', { hasText: 'less than' }).waitFor();
  await page.fill('#rMin', '3000000');
  await page.fill('#rMax', '5000000');
  await page.locator('#rMin').blur();
  await shot('07-budget');
  await page.locator('#nextBtn').click();
  await page.waitForFunction(() => /decision maker/i.test(document.querySelector('.q-text').textContent));
  await page.locator('[data-act="skip"]').click();
  await page.waitForFunction(() => /priorities/i.test(document.querySelector('.q-text').textContent));
  for (const t of ['Price', 'View', 'Payment plan', 'Size']) await tapOpt(t);
  assert.strictEqual(await page.locator('.opt.sel').count(), 3, 'max 3 picks');
  await shot('08-multi');
  await page.locator('#nextBtn').click();
  await page.waitForFunction(() => /reserving/i.test(document.querySelector('.q-text').textContent));

  // reload mid-flow → resume card
  await page.reload();
  await page.locator('[data-act="resume"]').waitFor();
  await page.locator('[data-act="resume"]').click();
  await page.waitForFunction(() => /reserving/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Yes');
  await page.locator('#cName').waitFor();
  await page.fill('#cName', 'Ahmed Client');
  await page.fill('#cPhone', '050 123 4567');
  await shot('09-contact');
  await page.locator('#saveBtn').click();
  await page.locator('.done-badge').waitFor();
  await page.locator('#savedSync .notice.ok').waitFor({ timeout: 15000 });
  await shot('10-saved');

  let d = await dump();
  const H = d.Leads[0], R = d.Leads[1];
  const c = n => R[H.indexOf(n)];
  assert.strictEqual(c('Client Name'), 'Ahmed Client');
  assert.strictEqual(c('Phone'), '+971501234567');
  assert.strictEqual(c('Unit type'), '4BR');
  assert.strictEqual(c('Property type'), 'Villa');
  assert.strictEqual(c('Project'), 'SAMPLE – Palm Grove Villas');
  assert.strictEqual(c('Budget (AED)'), '3,000,000 – 5,000,000');
  assert.strictEqual(c('Bought off-plan before'), 'Skipped');
  assert.strictEqual(c('Top priorities'), 'Price, View, Payment plan');
  assert.strictEqual(c('Reserve during roadshow'), 'Yes');
  assert.strictEqual(c('Agent'), 'Test Agent 1');
  console.log('lead 1 row OK');

  // ---- lead 2 (offline) with duplicate phone + apartment path
  await page.locator('[data-act="new"]').click();
  await ctx.setOffline(true);
  await tapOpt('Live in it');
  await page.waitForFunction(() => /property type/i.test(document.querySelector('.q-text').textContent));
  await tapOpt('Apartment');
  await page.waitForFunction(() => document.querySelectorAll('.opt').length === 5);
  await tapOpt('2BR');
  for (let i = 0; i < 12; i++) {
    const t = (await qText()).toLowerCase();
    if (t.includes('client details')) break;
    if (await page.locator('[data-act="skip"]').count()) { await page.locator('[data-act="skip"]').click(); }
    else if (t.includes('budget')) { await page.fill('#rMax', '2000000'); await page.locator('#nextBtn').click(); }
    else if (t.includes('aldar project')) { await tapOpt('No'); }
    else { await page.locator('.opt').first().click(); }
    await page.waitForTimeout(350);
  }
  await page.locator('#cName').waitFor();
  assert.strictEqual(await page.locator('.q-text').textContent(), 'Client details');
  await page.fill('#cName', 'Offline Client');
  await page.fill('#cPhone', '501234567');
  await page.locator('#dupWarn .notice.warn').waitFor();
  await shot('11-duplicate');
  await page.locator('#saveBtn').click();
  await page.locator('.done-badge').waitFor();
  await page.locator('#savedSync .notice.warn').waitFor();
  await shot('12-saved-offline');
  await page.locator('[data-act="home"]').click();
  await page.locator('.pill.is-offline').waitFor();
  assert.match(await page.locator('.pill').textContent(), /1 pending sync/);
  await shot('13-home-offline');
  d = await dump();
  assert.strictEqual(d.Leads.length, 2, 'not synced while offline');

  // reload while offline (service worker must serve the app)
  await page.reload();
  await page.locator('.cta-card').waitFor();
  assert.match(await page.locator('.pill').textContent(), /1 pending sync/);
  console.log('offline reload OK');

  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => /All synced/.test(document.querySelector('.pill').textContent), null, { timeout: 20000 });
  d = await dump();
  assert.strictEqual(d.Leads.length, 3, 'synced after online');
  const R2 = d.Leads[2];
  assert.strictEqual(R2[H.indexOf('Unit type')], '2BR');
  assert.strictEqual(R2[H.indexOf('Budget (AED)')], 'Up to 2,000,000');
  assert.strictEqual(R2[H.indexOf('Project')], '', 'hidden question not saved');
  await shot('14-home-synced');

  // logout / persistence
  await page.reload();
  await page.locator('.cta-card').waitFor();
  await page.locator('[data-act="logout"]').click();
  await page.locator('.sheet [data-ok]').click();
  await page.locator('.agent-btn').first().waitFor();

  assert.deepStrictEqual(errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(e)), [], 'no JS errors');
  console.log('✅ e2e passed');
  await browser.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
