// Smoke scénář: bilance – nedělní banner, Bilance týdne (řádky + cíl), cíl na další týden, kouč ho v pondělí/úterý hlídá
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const errs = [];
  const seed = () => {
    const days = {}, pad = n => String(n).padStart(2, '0'), key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const end = new Date(2026, 10, 22, 12); const beds = ['23:05', '00:40', '23:20', '01:05', '23:10', '00:20', '22:55'];
    for (let i = 20; i >= 0; i--) {
      const d = new Date(end); d.setDate(d.getDate() - i); const k = key(d), wd = d.getDay();
      const day = { date: k, bed: beds[i % 7], wake: '07:00', energy: 3, weight: +(82 + (20 - i) * 0.05).toFixed(1), kcal: i % 3 ? 4100 : 3500, protein: 170,
        habits: { mobil: i % 2 === 0, hygiena: true, gauc: true, zapis: i % 5 === 0, budik: i % 3 !== 1, kreatin: true, noporn: i % 4 !== 0 } };
      if ([2, 3, 5, 0].includes(wd) || wd === 1 || wd === 6) day.training = i % 6 !== 0;
      if (wd === 3) day.lifts = { bench: { w: i > 7 ? 95 : 100, r: 6 } };
      if (wd === 5) day.lifts = { pull: { w: 10, r: 7 } };
      if (wd === 1 && i < 7) day.habits.rannibeh = true;
      days[k] = day;
    }
    localStorage.setItem('tvt-days', JSON.stringify(days));
    localStorage.setItem('tvt-settings', JSON.stringify({ startWeight: 80, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7.5, hmDate: '2027-06-30', proteinPerKg: 2 }));
  };
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-22T18:30:00') }); // neděle večer
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(400); await p.evaluate(seed); await p.reload(); await p.waitForTimeout(800);
  const banner = await p.isVisible('#sumBanner');
  await p.click('#sumBannerBtn'); await p.waitForTimeout(400);
  const rv = await p.evaluate(() => ({ title: document.getElementById('rvTitle').textContent, rows: [...document.querySelectorAll('.rvrow')].map(x => x.innerText.replace(/\s+/g, ' ').trim()),
    goalWk: document.getElementById('rvGoalWk').textContent, sug: [...document.querySelectorAll('[data-sug]')].map(x => x.textContent) }));
  await p.screenshot({ path: SP + '/b1_review.png', fullPage: true });
  await p.click('[data-sug] >> nth=0'); await p.waitForTimeout(400);
  const goals = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-settings')).weekGoals);
  const set = await p.textContent('#rvGoal .rvset').catch(() => null);
  await p.click('#rvPrev'); await p.waitForTimeout(200); const prevTitle = await p.textContent('#rvTitle');
  await p.click('#rvBack'); await p.waitForTimeout(300); const ovVisible = await p.isVisible('#v-overview');
  // úterý: kouč ukazuje cíl týdne
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push('P2 ' + e.message));
  await p2.clock.install({ time: new Date('2026-11-24T08:00:00') });
  await p2.goto(process.env.DEMO_URL); await p2.waitForTimeout(800);
  const plan = await p2.$$eval('#coachPlan .ctask', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  const banner2 = await p2.isVisible('#sumBanner');
  await p2.locator('#coachCard').screenshot({ path: SP + '/b2_coach_goal.png' });
  console.log(JSON.stringify({ banner, rv, goals, set, prevTitle, ovVisible, plan, banner2, errs }, null, 1)); await b.close(); })();
