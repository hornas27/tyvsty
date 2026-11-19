// Smoke scénář: pretizeni-mapa-rekordy – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  // seed: 60 dní dat s váhami cviků (st = bench), dnes je pátek
  await p.evaluate(() => {
    const days = {}, pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date(); now.setHours(12);
    for (let i = 60; i >= 1; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = key(d), wd = d.getDay();
      const day = { date: k, weight: +(80 + (60 - i) * 0.03).toFixed(1), kcal: 3500 + (i % 5) * 150, protein: 150 + (i % 4) * 10, training: i % 5 !== 0, habits: { mobil: true, hygiena: i % 3 !== 0, gauc: true, zapis: i % 4 !== 0 }, energy: 3 };
      const wk = Math.floor((60 - i) / 7);
      if (wd === 3) day.lifts = { bench: { w: 70 + Math.floor(wk / 2) * 2.5, r: wk % 2 ? 8 : 6 } };
      if (wd === 5) day.lifts = { pull: { w: 10, r: 6 + (wk % 3) }, ohp: { w: 50, r: 5 } };
      if (wd === 2) day.lifts = { rdl: { w: 80 + wk * 5, r: 7 } };
      days[k] = day; }
    localStorage.setItem('tvt-days', JSON.stringify(days));
    localStorage.setItem('tvt-settings', JSON.stringify({ startWeight: 80, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7, hmDate: '2027-06-30', proteinPerKg: 2 }));
  });
  await p.reload(); await p.waitForTimeout(700);
  while (await p.evaluate(() => new Date(document.getElementById('daySub').textContent ? Date.now() : 0) && !document.querySelector('.lift[data-lift="ohp"]'))) { await p.click('#prevDay'); await p.waitForTimeout(150); }
  const hints = await p.$$eval('#exList small[data-hint]', e => e.map(x => x.parentElement.dataset.lift + ': ' + x.textContent.trim()));
  // zadej nový rekord na ohp
  const ohp = p.locator('.lift[data-lift="ohp"] input[data-f="w"]'); await ohp.fill('60'); await p.locator('.lift[data-lift="ohp"] input[data-f="r"]').fill('8'); await p.waitForTimeout(800);
  const prHint = await p.textContent('small[data-hint="ohp"]');
  // oblíbené: ručně jídlo -> do oblíbených -> přidat klikem
  await p.click('#btnManual'); await p.fill('#p-name', 'Shake'); await p.fill('#p-kcal', '900'); await p.fill('#p-prot', '50'); await p.click('#aiFav'); await p.click('#aiCancel'); await p.waitForTimeout(300);
  const favVisible = await p.isVisible('#favBox'); await p.click('.fav-add'); await p.waitForTimeout(300);
  const mealsAfter = await p.$$eval('#mealList .meal-n', e => e.map(x => x.textContent)); const kcal = await p.textContent('#mKcal');
  await p.screenshot({ path: SP + '/f1_today.png', fullPage: true });
  await p.click('nav.tabs button:nth-child(2)'); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelectorAll('#v-overview details.det').forEach(d => { d.open = true; })); await p.waitForTimeout(400);
  const map = await p.evaluate(() => ({ title: document.getElementById('mapTitle').textContent, cells: document.querySelectorAll('#mapGrid i:not(.out)').length, l3: document.querySelectorAll('#mapGrid i.l3').length, months: document.querySelectorAll('#mapMonths span').length, stats: document.getElementById('mapStats').textContent, todayVisible: (() => { const s = document.getElementById('mapScroll'), t = s.querySelector('.today'); return t ? (t.offsetLeft >= s.scrollLeft && t.offsetLeft <= s.scrollLeft + s.clientWidth) : false; })() }));
  const str = await p.$$eval('.lift-card summary', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  await p.click('.lift-card summary'); await p.waitForTimeout(200);
  const recs = await p.$$eval('.rec', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  await p.screenshot({ path: SP + '/f2_overview.png', fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(400); await p.screenshot({ path: SP + '/f3_desktop.png', fullPage: true });
  console.log(JSON.stringify({ hints, prHint, favVisible, mealsAfter, kcal, map, str, recs, errs }, null, 1)); await b.close(); })();
