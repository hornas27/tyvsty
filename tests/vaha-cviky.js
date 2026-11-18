// Smoke scénář: vaha-cviky – karta Váha (graf, rozsahy, týden po týdnu) + zápis nejtěžší série u všech cviků s porovnáním s minulým tréninkem
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  // seed: 10 týdnů vážení (různé tempo), cviky v neděli/středu; dnes = neděle 15. 11. (Celý hořejšek)
  await p.evaluate(() => {
    const days = {}, pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date(); now.setHours(12);
    const rate = [0.4, 0.3, 0.1, -0.2, 0.5, 0.8, 0.35, 0, 0.3, 0.45];
    let w = 80;
    for (let i = 70; i >= 1; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const k = key(d), wd = d.getDay(), wk = Math.floor((70 - i) / 7);
      w += rate[wk] / 7; const day = { date: k };
      if (i % 3 !== 1) day.weight = +(w + Math.sin(i * 1.7) * 0.5).toFixed(1);
      if (wd === 0) day.lifts = { incline: { w: 60 + wk * 2.5, r: 7 }, rowwide: { w: 55, r: 8 }, lateral: { w: 10, r: 9 }, bayes: { w: 12.5, r: 8 }, triceps: { w: 20 + wk, r: 8 } };
      if (wd === 3) day.lifts = { bench: { w: 80 + wk * 2.5, r: 6 }, lateral: { w: 12.5, r: 6 } };
      days[k] = day; }
    localStorage.setItem('tvt-days', JSON.stringify(days));
    localStorage.setItem('tvt-settings', JSON.stringify({ startWeight: 80, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7, hmDate: '2027-06-30', proteinPerKg: 2 }));
  });
  await p.reload(); await p.waitForTimeout(700);
  const liftsToday = await p.$$eval('#exList .lift', e => e.map(x => x.dataset.lift));
  const hintsBefore = await p.$$eval('#exList small[data-hint]', e => e.map(x => x.parentElement.dataset.lift + ': ' + x.textContent.trim()));
  const fill = async (id, w, r) => { await p.locator(`.lift[data-lift="${id}"] input[data-f="w"]`).fill(String(w)); await p.locator(`.lift[data-lift="${id}"] input[data-f="r"]`).fill(String(r)); };
  await fill('incline', 87.5, 8); await fill('rowwide', 55, 8); await fill('lateral', 10, 10); await fill('triceps', 25, 6); await fill('reardeltc', 15, 10);
  await p.fill('#f-weight', '84.6'); await p.waitForTimeout(900);
  const hintsAfter = await p.$$eval('#exList small[data-hint]', e => e.map(x => x.parentElement.dataset.lift + ': ' + x.textContent.trim()));
  const weightWeek = await p.textContent('#weightWeek');
  await p.screenshot({ path: SP + '/v1_today.png', fullPage: true });
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(700);
  const card = await p.evaluate(() => ({ now: document.getElementById('wNow').textContent, nowS: document.getElementById('wNowS').textContent,
    weeks: [...document.querySelectorAll('#wWeeks li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()),
    range: [...document.querySelectorAll('#wRange button')].map(b => b.dataset.r + '=' + b.getAttribute('aria-pressed')) }));
  const str = await p.$$eval('#strengthBox .lift-day, #strengthBox .lift-card summary', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  const recs = await p.$$eval('.rec .rl', e => e.map(x => x.textContent.trim()));
  await p.locator('#wCard').screenshot({ path: SP + '/v2_weight_90.png' });
  await p.click('#wRange button[data-r="28"]'); await p.waitForTimeout(200); await p.locator('#wCard').screenshot({ path: SP + '/v3_weight_28.png' });
  await p.click('#wRange button[data-r="all"]'); await p.waitForTimeout(200); await p.locator('#wCard').screenshot({ path: SP + '/v4_weight_all.png' });
  const stored = await p.evaluate(() => localStorage.getItem('tvt-wrange'));
  await p.locator('#strengthBox').screenshot({ path: SP + '/v5_strength.png' });
  await p.evaluate(() => document.getElementById('themeBtn').click()); await p.waitForTimeout(200); await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(400); await p.locator('#wCard').screenshot({ path: SP + '/v6_weight_light.png' });
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(400); await p.locator('#wCard').screenshot({ path: SP + '/v7_weight_desktop.png' });
  console.log(JSON.stringify({ liftsToday, hintsBefore, hintsAfter, weightWeek, card, stored, str, recs, errs }, null, 1)); await b.close(); })();
