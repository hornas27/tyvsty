// Smoke scénář: prohozeni-treninku – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } }); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.DEMO_URL); await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForTimeout(800);
  const o = {}; const st = async () => ({ day: await p.textContent('#daySub'), train: (await p.textContent('#trainBox b')).trim(), ex: !(await p.isHidden('#exList')), runF: !(await p.isHidden('#runField')), run: await p.inputValue('#f-run'), sel0: await p.$eval('#swapSel option', o => o.textContent), reset: await p.isVisible('#swapReset') });
  o.sunday = await st(); o.opts = await p.$$eval('#swapSel option', e => e.map(x => x.textContent));
  await p.click('#nextDay'); await p.waitForTimeout(200);
  await p.fill('#f-run', '6x 2 min rychle'); await p.waitForTimeout(800);
  o.monBefore = await st();
  await p.selectOption('#swapSel', '2026-11-17'); await p.waitForTimeout(300);
  o.monAfter = await st(); o.toast = await p.textContent('#saveMsg').catch(() => '');
  await p.click('#nextDay'); await p.waitForTimeout(200); o.tueAfter = await st();
  await p.screenshot({ path: SP + '/swap_tue.png', fullPage: false });
  const tb = await p.$('.blk-train'); await tb.screenshot({ path: SP + '/swap_card.png' });
  // reload persists
  await p.reload(); await p.waitForTimeout(800); await p.click('#nextDay'); await p.click('#nextDay'); await p.waitForTimeout(200); o.tueReload = await st();
  await p.click('#swapReset'); await p.waitForTimeout(300); o.tueReset = await st();
  await p.click('#prevDay'); await p.waitForTimeout(200); o.monReset = await st();
  // tento týden: Ne <-> Čt (volitelný chill run) a přehled
  await p.click('#goToday'); await p.selectOption('#swapSel', '2026-11-12'); await p.waitForTimeout(300); o.sunSwap = await st();
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(400); o.kTrain = await p.textContent('#k-train');
  o.stored = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { plan: v.plan, run: v.run }])); });
  console.log(JSON.stringify({ ...o, errs }, null, 1)); await b.close(); })();
