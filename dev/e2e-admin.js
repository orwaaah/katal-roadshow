// Admin dashboard test (run after dev/e2e.js so there is data): node dev/e2e-admin.js
const { chromium } = require('playwright');
const assert = require('assert');
const SHOTS = process.env.SHOTS || '/tmp/shots';
(async () => {
  const pin = (await (await fetch('http://localhost:8081/__adminpin')).json()).pin;
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, vp] of [['desk', { width: 1366, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8080/admin.html?api=http://localhost:8081/exec');
    await page.fill('#pin', '000000');
    await page.click('#go');
    await page.locator('#err', { hasText: 'Wrong' }).waitFor();
    await page.fill('#pin', pin);
    await page.click('#go');
    await page.locator('.kpi').first().waitFor();
    const total = await page.locator('.kpi.accent b').textContent();
    assert.ok(Number(total) >= 2, 'total ' + total);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/40-admin-${name}.png`, fullPage: name === 'desk' });
    // filter by agent via table
    await page.locator('#agTbl tr[data-agent="Test Agent 1"]').click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('#showing').textContent(), /Showing \d+ of/);
    // open a lead
    await page.locator((name === 'desk' ? '.leads-tbl' : '.mob-cards') + ' [data-id]').first().click();
    await page.locator('.drawer').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/41-drawer-${name}.png` });
    await page.locator('[data-close]').click();
    if (name === 'desk') {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#xlsBtn')]);
      assert.match(dl.suggestedFilename(), /^KATAL-Roadshow-Leads-.*\.xlsx$/);
      const p = await dl.path();
      assert.ok(require('fs').statSync(p).size > 2000, 'xlsx size');
      console.log('excel OK', dl.suggestedFilename());
    }
    await ctx.close();
  }
  assert.deepStrictEqual(errors, []);
  console.log('✅ admin passed');
  await browser.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
