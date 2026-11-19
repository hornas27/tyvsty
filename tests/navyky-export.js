// Smoke scénář: navyky-export – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(700);
  const today = await p.$$eval('#habitBox .chk', e => e.map(x => x.textContent.trim()));
  await p.click('#habitBox .chk:last-child'); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); const k = Object.keys(d).sort().pop(); return k + ' ' + JSON.stringify(d[k].habits); });
  await p.click('#prevDay'); await p.waitForTimeout(200);
  const yest = await p.$$eval('#habitBox .chk', e => e.length);
  await p.click('nav.tabs button[data-view="settings"]'); await p.waitForTimeout(300); await p.click('#histCard summary'); await p.waitForTimeout(300);
  const dots = await p.$$eval('.hrow .dots', e => e.slice(0, 3).map(x => x.querySelectorAll('i').length));
  await p.click('nav.tabs button[data-view="settings"]'); await p.waitForTimeout(300);
  const ex = (await p.inputValue('#exText')).split('\n').filter(l => /^2026-11-1[0-2]/.test(l) || /^datum/.test(l)).map(l => l.split(';').slice(11, 19).join(';'));
  console.log(JSON.stringify({ today, saved, yest, dots, ex, errs }, null, 1)); await b.close(); })();
