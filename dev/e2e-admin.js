// Admin dashboard + editors test (run after dev/e2e.js so there is data): node dev/e2e-admin.js
const { chromium } = require('playwright');
const assert = require('assert');
const SHOTS = process.env.SHOTS || '/tmp/shots';
const dump = () => fetch('http://localhost:8081/__dump').then(r => r.json());
const call = (action, data) => fetch('http://localhost:8081/exec', { method: 'POST', body: JSON.stringify(Object.assign({ action }, data)) }).then(r => r.json());
(async () => {
  let pin = (await (await fetch('http://localhost:8081/__adminpin')).json()).pin;
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, vp] of [['desk', { width: 1366, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8080/admin.html?api=http://localhost:8081/exec');
    await page.evaluate(() => localStorage.removeItem('katal.adminView'));
    await page.fill('#pin', '000000');
    await page.click('#go');
    await page.locator('#err', { hasText: 'Wrong' }).waitFor();
    await page.fill('#pin', pin);
    await page.click('#go');
    await page.locator('.kpi').first().waitFor();
    assert.strictEqual(await page.locator('.kpi').count(), 4, 'lighter KPIs');
    assert.ok(!(await page.locator('.kpis').textContent()).includes('Reserve'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/40-admin-${name}.png`, fullPage: name === 'desk' });
    await page.locator('#agTbl tr[data-agent]').first().click();
    await page.waitForTimeout(200);
    await page.locator((name === 'desk' ? '.leads-tbl' : '.mob-cards') + ' [data-id]').first().click();
    await page.locator('.drawer').waitFor();
    await page.locator('[data-close]').click();
    if (name === 'desk') {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#xlsBtn')]);
      assert.match(dl.suggestedFilename(), /^KATAL-Roadshow-Leads-.*\.xlsx$/);

      // ---------- Questions editor
      await page.click('[data-view="questions"]');
      await page.locator('.ed-item').first().waitFor();
      const before = await page.locator('.ed-item').count();
      await page.screenshot({ path: `${SHOTS}/42-questions.png` });
      await page.click('#addQ');
      await page.fill('[data-f="text"]', 'How did you hear about us?');
      await page.fill('[data-f="label"]', 'Source');
      await page.selectOption('[data-f="type"]', 'multi');
      const opts = page.locator('[data-opt]');
      await opts.nth(0).fill('Instagram');
      await opts.nth(1).fill('Friend');
      await page.click('[data-oadd]');
      await opts.nth(2).fill('Billboard');
      await page.locator('[data-odown="0"]').click(); // Friend first
      await page.fill('[data-f="maxPicks"]', '2');
      await page.locator('.tog', { hasText: 'Optional' }).click();
      await page.selectOption('[data-f="showIfId"]', 'Q1');
      await page.locator('.chk', { hasText: 'Investment' }).click();
      await page.screenshot({ path: `${SHOTS}/43-question-form.png` });
      await page.click('[data-ok]');
      await page.locator('.ed-item', { hasText: 'How did you hear about us?' }).waitFor();
      assert.strictEqual(await page.locator('.ed-item').count(), before + 1);
      // move it up twice
      const last = before;
      await page.locator(`[data-up="${last}"]`).click();
      await page.waitForFunction(n => document.querySelectorAll('.ed-item')[n - 1].textContent.includes('hear about us'), last);
      let d = await dump();
      const QH = d.Questions[0];
      const qrow = d.Questions.find(r => r[QH.indexOf('Question')] === 'How did you hear about us?');
      assert.strictEqual(qrow[QH.indexOf('Options')], 'Friend, Instagram, Billboard');
      assert.strictEqual(qrow[QH.indexOf('Type')], 'Multiple choice');
      assert.strictEqual(String(qrow[QH.indexOf('Max Picks')]), '2');
      assert.strictEqual(qrow[QH.indexOf('Skippable')], 'Yes');
      assert.strictEqual(qrow[QH.indexOf('Show If Question ID')], 'Q1');
      assert.strictEqual(qrow[QH.indexOf('Show If Answers')], 'Investment');
      assert.strictEqual(Number(qrow[QH.indexOf('Order')]), last, 'moved up');
      assert.ok(d.Leads[0].includes('Source'), 'Leads column added');
      // moving Q3A above Q2 must be refused (depends on it)
      await page.locator('[data-up="2"]').click();
      await page.locator('#toast', { hasText: 'must come after' }).waitFor();
      console.log('questions editor OK');

      // ---------- Agents editor
      await page.click('[data-view="agents"]');
      await page.locator('#addP').click();
      await page.fill('[data-f="name"]', 'Nour Aziz');
      await page.fill('[data-f="pin"]', '12');
      await page.click('[data-ok]');
      await page.locator('[data-err]', { hasText: '4 digits' }).waitFor();
      await page.fill('[data-f="pin"]', '0456');
      await page.click('[data-ok]');
      await page.locator('td', { hasText: 'Nour Aziz' }).waitFor();
      assert.ok((await call('login', { name: 'Nour Aziz', pin: '0456' })).ok, 'new agent can sign in');
      // rename Test Agent 1 → keeps leads
      await page.locator('tr', { hasText: 'Test Agent 1' }).click();
      await page.fill('[data-f="name"]', 'Rami Khoury');
      await page.click('[data-ok]');
      await page.locator('td', { hasText: 'Rami Khoury' }).waitFor();
      const tok = (await call('login', { name: 'Rami Khoury', pin: '1111' })).token;
      assert.ok((await call('myLeads', { token: tok })).leads.length >= 2, 'renamed agent keeps leads');
      await page.screenshot({ path: `${SHOTS}/44-agents.png` });
      console.log('agents editor OK');

      // ---------- Admins editor
      await page.click('[data-view="admins"]');
      await page.locator('#addP').click();
      await page.fill('[data-f="name"]', 'Orwah');
      await page.fill('[data-f="pin"]', pin);
      await page.click('[data-ok]');
      await page.locator('[data-err]', { hasText: 'already uses this PIN' }).waitFor();
      await page.fill('[data-f="pin"]', '246810');
      await page.click('[data-ok]');
      await page.locator('td', { hasText: 'Orwah' }).waitFor();
      assert.strictEqual((await call('adminLogin', { pin: '246810' })).admin, 'Orwah');
      // change my own PIN → I stay signed in
      await page.locator('tr', { hasText: 'Main Admin' }).click();
      await page.fill('[data-f="pin"]', '555777');
      await page.click('[data-ok]');
      await page.locator('#toast', { hasText: 'Saved' }).waitFor();
      pin = '555777';
      await page.click('[data-view="dashboard"]');
      await page.locator('.kpi').first().waitFor();
      console.log('admins editor OK');

      // ---------- Projects + Units
      await page.click('[data-view="projects"]');
      await page.locator('.ecard', { hasText: 'Marina Heights' }).click();
      await page.fill('[data-f="name"]', 'Saadiyat Grove');
      await page.click('[data-ok]');
      await page.locator('.ecard', { hasText: 'Saadiyat Grove' }).waitFor();
      await page.click('[data-view="units"]');
      await page.locator('.panel-head', { hasText: 'Saadiyat Grove' }).waitFor();
      await page.locator('[data-addu="Saadiyat Grove"]').click();
      await page.fill('[data-f="propertyType"]', 'Apartment');
      await page.fill('[data-f="unitType"]', '1BR');
      await page.fill('[data-f="price"]', '1,100,000');
      await page.fill('[data-f="size"]', '800');
      await page.click('[data-ok]');
      await page.locator('#toast', { hasText: 'Saved' }).waitFor();
      await page.screenshot({ path: `${SHOTS}/45-units.png`, fullPage: true });
      d = await dump();
      const UH = d.Units[0];
      assert.strictEqual(d.Units.filter(r => r[UH.indexOf('Project Name')] === 'Saadiyat Grove').length, 6);
      console.log('projects + units OK');

      // ---------- Settings
      await page.click('[data-view="settings"]');
      await page.locator('[data-set="2"]').fill('Coming to the Event');
      await page.click('#saveSet');
      await page.locator('#toast', { hasText: 'Saved' }).waitFor();
      const cfg = await call('config', { token: tok });
      assert.strictEqual(cfg.lists[1], 'Coming to the Event');
      assert.strictEqual(cfg.invitationLink, 'https://orwaaah.github.io/invitation-/');
      assert.ok(cfg.questions.some(q => q.label === 'Source'));
      await page.screenshot({ path: `${SHOTS}/46-settings.png` });
      console.log('settings OK');

      // ---------- Switch to agent and back
      await page.click('#toAgent');
      await page.waitForURL(/\/(\?.*)?$/);
      await page.locator('.home-hero .title', { hasText: 'Hello, Main Admin' }).waitFor();
      await page.screenshot({ path: `${SHOTS}/48-admin-as-agent.png` });
      await page.locator('.cta-card').click();
      await page.fill('#cName', 'Admin VIP Guest');
      await page.fill('#cPhone', '0507778899');
      await page.locator('#saveBtn').click();
      await page.locator('.done-badge').waitFor();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('katal.outbox') || '[]').length === 0, null, { timeout: 20000 });
      d = await dump();
      const LH2 = d.Leads[0];
      const ar = d.Leads.find(r => r[LH2.indexOf('Client Name')] === 'Admin VIP Guest');
      assert.strictEqual(ar[LH2.indexOf('Agent')], 'Main Admin', 'lead saved under the admin name');
      await page.locator('[data-act="home"]').click();
      await page.locator('.switch-pill').click();
      await page.waitForURL(/admin\.html/);
      await page.click('[data-view="dashboard"]');
      await page.locator('#agTbl tr[data-agent="Main Admin"]').waitFor();
      assert.match(await page.locator('#agTbl tr[data-agent="Main Admin"]').textContent(), /Admin/);
      console.log('switch to agent OK');
    } else {
      await page.click('[data-view="questions"]');
      await page.locator('.ed-item').first().waitFor();
      await page.locator('[data-edit="0"]').first().click();
      await page.locator('.mbox').waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/47-mob-question-form.png` });
      await page.locator('.mfoot [data-x]').click();
    }
    await ctx.close();
  }
  assert.deepStrictEqual(errors, []);
  console.log('✅ admin passed');
  await browser.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
