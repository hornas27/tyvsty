// Smoke scénář: cviky-presun – pořadí cviků a přesun na jiný den (jen tento týden / natrvalo), vrácení původního plánu
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem('tvt-days', JSON.stringify({ '2026-11-08': { date: '2026-11-08', lifts: { triceps: { w: 25, r: 8 } } } })); });
  await p.reload(); await p.waitForTimeout(700);
  const order = () => p.$$eval('#exList li[data-ex]', e => e.map(x => x.dataset.ex));
  const before = await order();
  // 1) Bayesian curl o jedno výš – jen tento týden
  await p.click('[data-menu="bayes"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: SP + '/m1_panel.png', fullPage: true });
  await p.click('li[data-ex="bayes"] button[data-mv="up"]'); await p.waitForTimeout(300);
  const afterUp = await order();
  // 2) triceps přesunout na středu 11. 11. – jen tento týden (zapsaná série zůstává v historii)
  await p.click('[data-menu="triceps"]'); await p.waitForTimeout(150);
  await p.selectOption('li[data-ex="triceps"] select[data-mv="to"]', '2026-11-11'); await p.waitForTimeout(300);
  const afterMove = await order();
  const days = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); return { sun: d['2026-11-15'] && d['2026-11-15'].ex, wed: d['2026-11-11'] && d['2026-11-11'].ex }; });
  // 3) natrvalo: upažování níž
  await p.click('[data-menu="lateral"]'); await p.waitForTimeout(150);
  await p.click('li[data-ex="lateral"] button[data-scope="perm"]'); await p.waitForTimeout(150);
  await p.click('li[data-ex="lateral"] button[data-mv="down"]'); await p.waitForTimeout(300);
  const afterPerm = await order();
  const planEx = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).planEx);
  const sunEx = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days'))['2026-11-15'].ex);
  // středa: je tam triceps s historií?
  for (let i = 0; i < 4; i++) { await p.click('#prevDay'); await p.waitForTimeout(150); }
  const wed = await order(); const wedHint = await p.textContent('small[data-hint="triceps"]').catch(() => null);
  for (let i = 0; i < 4; i++) { await p.click('#nextDay'); await p.waitForTimeout(150); }
  // 4) vrátit původní
  await p.click('#exList button[data-mv="reset"]'); await p.waitForTimeout(300);
  const afterReset = await order();
  const planEx2 = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).planEx);
  await p.screenshot({ path: SP + '/m2_after.png', fullPage: true });
  console.log(JSON.stringify({ before, afterUp, afterMove, days, afterPerm, planEx, sunEx, wed, wedHint, afterReset, planEx2, errs }, null, 1)); await b.close(); })();
