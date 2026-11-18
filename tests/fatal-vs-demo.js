// Smoke scénář: fatal-vs-demo – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const out = {};
  for (const [name, url] of [["realConfig_noFirebase", process.env.REAL_URL], ["demo", process.env.DEMO_URL]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route('https://www.gstatic.com/**', r => r.abort()); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(1500);
    out[name] = await p.evaluate(() => ({ mode: document.getElementById('mode').textContent, appHidden: document.getElementById('app').hidden, alert: (document.querySelector('[role=alert]') || {}).innerText || null, demoStored: localStorage.getItem('tvt-days') }));
    out[name].errs = errs; await p.close(); }
  console.log(JSON.stringify(out, null, 1)); await b.close(); })();
