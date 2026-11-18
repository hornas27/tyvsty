// Smoke scénář: ukladani-flush – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(600);
  // napiš váhu a hned „zavři“ (skryj stránku) – musí se uložit bez čekání
  await p.fill('#f-weight', '87.3');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const w1 = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days') || '{}'); return Object.values(d).map(x => x.weight).filter(Boolean); });
  // napiš a hned přepni den
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await p.fill('#f-note', 'test poznamka'); await p.click('#prevDay'); 
  const n1 = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days') || '{}'); return Object.values(d).map(x => x.note).filter(Boolean); });
  console.log(JSON.stringify({ savedOnHide: w1, savedOnDaySwitch: n1, errs })); await b.close(); })();
