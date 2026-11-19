// Smoke scénář: kouc – připravenost, dnešní plán, hlídač (odklepnutí), týdenní návyk Ranní běh, vlastní návyk v Nastavení, vypnutí kouče
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-20T08:00:00') }); // pátek: záda + ramena + triceps
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => {
    const days = {}, pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date(); now.setHours(12);
    const beds = ['23:05', '00:40', '23:20', '01:05', '23:10', '00:20', '22:55'];
    for (let i = 21; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); const k = key(d), wd = d.getDay();
      const day = { date: k, bed: beds[i % 7], wake: '07:00', energy: 3 + (i % 3 === 0 ? 1 : 0),
        habits: { mobil: i % 2 === 0, hygiena: true, gauc: true, zapis: i % 5 === 0, budik: i % 3 !== 1, kreatin: true } };
      if (i !== 0 && i !== 1) day.weight = +(82 + (21 - i) * 0.05).toFixed(1);
      if (i > 0) { day.kcal = i <= 2 ? 3300 : 4100; day.protein = 170; }
      if (wd === 5 && i > 0) { day.training = true; day.lifts = { pull: { w: 10, r: 7 }, ohp: { w: 50 + (i > 10 ? 0 : 5), r: 8 } }; }
      if (wd === 3 && i > 0) { day.training = true; day.lifts = { bench: { w: i > 5 ? 95 : 100, r: 6 } }; }
      if (wd === 2 && i > 0) day.training = true;
      if ((wd === 1 || wd === 3) && i <= 4 && i > 0) day.habits.rannibeh = true;
      days[k] = day;
    }
    localStorage.setItem('tvt-days', JSON.stringify(days));
    localStorage.setItem('tvt-settings', JSON.stringify({ startWeight: 80, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7.5, hmDate: '2027-06-30', proteinPerKg: 2 }));
  });
  await p.reload(); await p.waitForTimeout(800);
  const coach = async () => p.evaluate(() => ({
    ready: document.getElementById('coachReady').innerText.replace(/\s+/g, ' ').trim(),
    plan: [...document.querySelectorAll('#coachPlan .ctask')].map(x => (x.querySelector('i').className || '-') + ' | ' + x.innerText.replace(/\s+/g, ' ').trim()),
    watch: [...document.querySelectorAll('#coachWatch .calert')].map(x => x.className.replace('calert ', '') + ' | ' + x.innerText.replace(/\s+/g, ' ').trim())
  }));
  const before = await coach();
  await p.locator('#coachCard').screenshot({ path: SP + '/k1_coach.png' });
  // zváží se a dá energii -> plán se odškrtne, připravenost se přepočítá
  await p.fill('#f-weight', '83.1'); await p.click('#energyBox button >> nth=4'); await p.waitForTimeout(800);
  const afterInput = await coach();
  // odklepnout první hlášku
  const firstId = await p.getAttribute('#coachWatch [data-snooze] >> nth=0', 'data-snooze');
  await p.click('#coachWatch [data-snooze] >> nth=0'); await p.waitForTimeout(400);
  const afterSnooze = await coach(); const snooze = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).coachSnooze);
  // ranní běh v návycích
  const habits = await p.$$eval('#habitBox .chk', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  await p.screenshot({ path: SP + '/k2_today.png', fullPage: true });
  // vlastní návyk + vypnutí kouče
  await p.click('nav.tabs button[data-view="settings"]'); await p.waitForTimeout(300);
  await p.fill('#chName', 'Testovací návyk'); await p.selectOption('#chFreq', ''); await p.click('#chAdd'); await p.waitForTimeout(300);
  const chList = await p.$$eval('#chList li', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  await p.locator('#chList').locator('..').screenshot({ path: SP + '/k3_settings.png' });
  await p.uncheck('#coachOff'); await p.waitForTimeout(300);
  await p.click('nav.tabs button[data-view="today"]'); await p.waitForTimeout(300);
  const coachHidden = await p.isHidden('#coachCard');
  const habitsCustom = await p.$$eval('#habitBox .chk', e => e.map(x => x.innerText.split('\n')[0]));
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(500);
  const table = await p.$$eval('.hab tbody tr', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log(JSON.stringify({ before, afterInput, firstId, afterSnooze, snooze, habits, chList, coachHidden, habitsCustom, table, errs }, null, 1)); await b.close(); })();
