// Smoke scénář: beh-hlidac – kouč s během (skok objemu, nejdelší běh), hlídač plánu týdne, Přehled → Běh, report pro placené Gemini
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => {
    const days = {}, add = (k, km, sec, hr, feel, run) => { days[k] = { date: k, training: true, run: run || null, runLog: { km, sec, hr, feel } }; };
    [['2026-10-19', '2026-10-22', '2026-10-24'], ['2026-10-26', '2026-10-29', '2026-10-31'], ['2026-11-02', '2026-11-05', '2026-11-07']].forEach(w => { add(w[0], 6, 1980, 150, 3); add(w[1], 6, 2100, 140, 2); add(w[2], 8, 2880, 145, 3); });
    add('2026-11-09', 8, 2520, 158, 4, 'Intervaly 6× 800 m'); add('2026-11-12', 8, 2880, 142, 2); add('2026-11-14', 16, 6000, 150, 4, 'Long run 16 km');
    days['2026-11-15'] = { date: '2026-11-15', bed: '01:30', wake: '06:30', energy: 2 };
    localStorage.setItem('tvt-days', JSON.stringify(days));
  });
  await p.reload(); await p.waitForTimeout(800);
  const coach = await p.evaluate(() => ({ plan: document.getElementById('coachPlan').innerText, watch: document.getElementById('coachWatch').innerText }));
  await p.locator('#coachCard').screenshot({ path: SP + '/h1_coach.png' });
  // hlídač plánu: příští týden, návrh trenéra (demo 29 km proti Ø 24 km)
  await p.click('#nextDay'); await p.waitForTimeout(300);
  await p.click('#weekLink'); await p.waitForTimeout(200);
  await p.click('#wbReport'); await p.waitForTimeout(300);
  const report = await p.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
  const reportMsg = await p.textContent('#wbReportMsg');
  await p.click('#wbCoach'); await p.waitForTimeout(800);
  const warn = await p.evaluate(() => { const w = document.querySelector('#wbMsg .planwarn'); return w ? w.innerText : null; });
  await p.locator('#weekBox').screenshot({ path: SP + '/h2_planwarn.png' });
  // vložený plán z Gemini: long run v pondělí před nohama
  await p.click('#wbCancel2'); await p.click('#weekLink'); await p.waitForTimeout(200);
  await p.fill('#wbText', 'Pondělí: Long run 18 km\nčtvrtek: 5 km lehce\nsobota: 10 km'); await p.click('#wbSplit'); await p.waitForTimeout(200);
  const warn2 = await p.evaluate(() => { const w = document.querySelector('#wbMsg .planwarn'); return w ? w.innerText : null; });
  // Přehled → Běh
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelector('#runCard details').open = true; }); await p.waitForTimeout(200);
  const overview = await p.evaluate(() => ({ status: document.getElementById('runStatus').innerText, stats: document.getElementById('runStats').innerText, recs: document.getElementById('runRecs').innerText, list: document.getElementById('runList').children.length }));
  await p.locator('#runCard').screenshot({ path: SP + '/h3_runcard.png' });
  console.log(JSON.stringify({ coach, reportMsg, report: report.slice(0, 900), warn, warn2, overview, errs }, null, 1)); await b.close(); })();
