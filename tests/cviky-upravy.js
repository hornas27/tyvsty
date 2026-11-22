// Smoke scénář: cviky-upravy – přidání nového cviku (tento týden / natrvalo), cvik ze seznamu se společnou historií, přejmenování, odebrání; profil běžce
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem('tvt-days', JSON.stringify({ '2026-11-10': { date: '2026-11-10', lifts: { legpress: { w: 140, r: 8 } } } })); });
  await p.reload(); await p.waitForTimeout(700);
  const order = () => p.$$eval('#exList li[data-ex]', e => e.map(x => x.dataset.ex));
  const names = () => p.$$eval('#exList li[data-ex] > span:not(.exr)', e => e.map(x => x.textContent));
  const before = await order();
  // 1) nový cvik jen tento týden
  await p.click('#exList button[data-mv="add"]'); await p.waitForTimeout(150);
  await p.fill('#adName', 'Face pull'); await p.fill('#adSets', '3 × 12');
  await p.screenshot({ path: SP + '/c1_add.png', fullPage: true });
  await p.click('#exList button[data-mv="addsave"]'); await p.waitForTimeout(300);
  const afterAdd = await order(); const newId = afterAdd.find(x => !before.includes(x));
  await p.fill(`li[data-ex="${newId}"] input[data-f="w"]`, '30'); await p.fill(`li[data-ex="${newId}"] input[data-f="r"]`, '12'); await p.waitForTimeout(800);
  // 2) cvik ze seznamu natrvalo (Leg press – společná historie)
  await p.click('#exList button[data-mv="add"]'); await p.waitForTimeout(150);
  await p.click('#exList li.exadd button[data-scope="perm"]'); await p.waitForTimeout(150);
  await p.fill('#adName', 'leg press'); await p.press('#adName', 'Enter'); await p.waitForTimeout(300);
  const afterAdd2 = await order(); const lpHint = await p.textContent('small[data-hint="legpress"]').catch(() => null);
  const planEx = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).planEx);
  // 3) přejmenovat Bayesian curl
  // (úprava a odebrání jsou v Plánu týdne)
  await p.click('#openPlan'); await p.waitForTimeout(400);
  await p.click('[data-pv="exopen"][data-slot="2026-11-15"][data-id="bayes"]'); await p.waitForTimeout(150);
  await p.click('[data-pv="mode"][data-mode="edit"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: SP + '/c2_edit.png', fullPage: true });
  await p.fill('#edName', 'Bayesian curl na kladce'); await p.click('[data-pv="editsave"]'); await p.waitForTimeout(300);
  // 4) odebrat triceps jen tento týden (2 klepnutí)
  await p.click('[data-pv="exopen"][data-slot="2026-11-15"][data-id="triceps"]'); await p.waitForTimeout(150);
  await p.click('[data-pv="del"]'); await p.waitForTimeout(150);
  await p.click('[data-pv="del"]'); await p.waitForTimeout(300);
  await p.click('#pvBack'); await p.waitForTimeout(300);
  const afterEdit = await names();
  const afterDel = await order();
  const settings = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')));
  const day = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days'))['2026-11-15']);
  await p.screenshot({ path: SP + '/c3_after.png', fullPage: true });
  // nový cvik v Přehledu (síla)
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(400);
  const overviewHasNew = await p.evaluate(() => document.getElementById('v-overview').textContent.includes('Face pull'));
  // 5) profil běžce v Nastavení
  await p.click('nav.tabs button[data-view="settings"]'); await p.waitForTimeout(300);
  await p.fill('#rpText', 'Testovací profil: lehký běh 6:00/km.'); await p.click('#rpSave'); await p.waitForTimeout(300);
  const rpInfo = await p.textContent('#rpInfo');
  await p.locator('#rpCard').screenshot({ path: SP + '/c4_profile.png' });
  const runProfile = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).runProfile);
  console.log(JSON.stringify({ before, afterAdd, newId, afterAdd2, lpHint, planEx, afterEdit, afterDel, exDefs: settings.exDefs, dayEx: day.ex, dayLifts: day.lifts, overviewHasNew, rpInfo, runProfile, errs }, null, 1)); await b.close(); })();
