// Smoke scénář: cviky-presun – rychlý přesun cviku z Dnes (i se zápisem, i na běžecký den) + Zpět; Plán týdne: kopie, přesun natrvalo, úprava, přidání, odebrání, prohození dnů, úprava běhu, vrácení týdne
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem('tvt-days', JSON.stringify({ '2026-11-08': { date: '2026-11-08', lifts: { triceps: { w: 22.5, r: 8 } } }, '2026-11-15': { date: '2026-11-15', lifts: { triceps: { w: 25, r: 8 } } } })); });
  await p.reload(); await p.waitForTimeout(700);
  const D = () => p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days')));
  const S = () => p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings') || '{}'));
  const order = () => p.$$eval('#exList li[data-ex]', e => e.map(x => x.dataset.ex));
  const before = await order();
  // 1) Dnes: triceps (už zapsaný) → pondělí 16. 11. (běžecký den)
  await p.click('[data-menu="triceps"]'); await p.waitForTimeout(200);
  await p.locator('#exList li[data-ex="triceps"]').screenshot({ path: SP + '/m1_panel.png' });
  await p.click('li[data-ex="triceps"] [data-mvto="2026-11-16"]'); await p.waitForTimeout(400);
  let d = await D();
  const quick = { today: await order(), mon: d['2026-11-16'].ex, liftMon: d['2026-11-16'].lifts, liftSun: d['2026-11-15'].lifts.triceps, undo: await p.isVisible('#undoBar'), undoTxt: await p.textContent('#undoTxt') };
  // 2) Zpět
  await p.click('#undoBtn'); await p.waitForTimeout(400);
  d = await D();
  const undone = { today: await order(), mon: d['2026-11-16'].ex, liftSun: d['2026-11-15'].lifts.triceps, liftMon: (d['2026-11-16'].lifts || {}).triceps ?? null };
  // 3) upažování na pondělí → na běžeckém dni se ukáže seznam cviků
  await p.click('[data-menu="lateral"]'); await p.waitForTimeout(150);
  await p.click('li[data-ex="lateral"] [data-mvto="2026-11-16"]'); await p.waitForTimeout(300);
  await p.click('#nextDay'); await p.waitForTimeout(300);
  const monList = { visible: await p.isVisible('#exList'), ids: await order() };
  await p.click('#goToday'); await p.waitForTimeout(300);
  // 4) Plán týdne
  await p.click('#openPlan'); await p.waitForTimeout(400);
  await p.screenshot({ path: SP + '/m2_plan.png', fullPage: true });
  const ex = (slot, id) => p.click(`[data-pv="exopen"][data-slot="${slot}"][data-id="${id}"]`);
  // kopie zadních ramen z neděle i na středu
  await ex('2026-11-15', 'reardeltc'); await p.waitForTimeout(150);
  await p.click('[data-pv="mode"][data-mode="copy"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: SP + '/m3_copy.png', fullPage: true });
  await p.click('[data-pv="copy"][data-to="2026-11-11"]'); await p.waitForTimeout(300);
  d = await D(); const copy = { wed: (d['2026-11-11'] || {}).ex, sun: d['2026-11-15'].ex };
  // natrvalo: incline z neděle na středu
  await p.click('#pvScope [data-scope="perm"]'); await p.waitForTimeout(200);
  await ex('dn0', 'incline'); await p.waitForTimeout(150);
  await p.click('[data-pv="mode"][data-mode="move"]'); await p.waitForTimeout(150);
  await p.click('[data-pv="move"][data-to="dn3"]'); await p.waitForTimeout(300);
  let s = await S(); d = await D(); const perm = { planEx: s.planEx, sunOverride: d['2026-11-15'].ex };
  // úprava názvu
  await ex('dn3', 'incline'); await p.waitForTimeout(150);
  await p.click('[data-pv="mode"][data-mode="edit"]'); await p.waitForTimeout(150);
  await p.fill('#edName', 'Smith incline bench 30°'); await p.click('[data-pv="editsave"]'); await p.waitForTimeout(300);
  // přidání do pátku
  await p.click('[data-pv="addopen"][data-slot="dn5"]'); await p.waitForTimeout(150);
  await p.fill('#pvAdName', 'Face pull'); await p.press('#pvAdName', 'Enter'); await p.waitForTimeout(300);
  // odebrání hyperextenze z pátku (2 klepnutí)
  await ex('dn5', 'hyper'); await p.waitForTimeout(150);
  await p.click('[data-pv="del"]'); await p.waitForTimeout(150); await p.click('[data-pv="del"]'); await p.waitForTimeout(300);
  s = await S(); const permEdits = { exDefs: s.exDefs, fri: s.planEx[5] };
  await p.screenshot({ path: SP + '/m4_perm.png', fullPage: true });
  // tento týden: prohodit čtvrtek ↔ sobotu, upravit běh v sobotu
  await p.click('#pvScope [data-scope="week"]'); await p.waitForTimeout(200);
  await p.click('[data-pv="swapopen"][data-slot="2026-11-12"]'); await p.waitForTimeout(150);
  await p.click('[data-pv="swap"][data-to="2026-11-14"]'); await p.waitForTimeout(300);
  await p.click('[data-pv="runopen"][data-slot="2026-11-14"]'); await p.waitForTimeout(150);
  await p.fill('#pvRunText', '6 km lehce'); await p.click('[data-pv="runsave"]'); await p.waitForTimeout(300);
  d = await D(); const swap = { thuPlan: d['2026-11-12'].plan, satPlan: d['2026-11-14'].plan, satRun: d['2026-11-14'].run };
  // vrátit týden
  const resetVisible = await p.isVisible('#pvReset');
  await p.click('#pvReset'); await p.waitForTimeout(400);
  d = await D(); const reset = { thuPlan: d['2026-11-12'].plan ?? null, wedEx: d['2026-11-11'].ex ?? null, monEx: d['2026-11-16'].ex };
  await p.click('#pvBack'); await p.waitForTimeout(300);
  const backOnToday = await p.isVisible('#exList');
  console.log(JSON.stringify({ before, quick, undone, monList, copy, perm, permEdits, swap, resetVisible, reset, backOnToday, errs }, null, 1)); await b.close(); })();
