// Smoke scénář: core – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright');
const SP = process.env.OUT;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
  const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto(process.env.DEMO_URL);
  await p.evaluate(() => {
    const days = {}; const pad = n => String(n).padStart(2, '0');
    const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date(); now.setHours(12);
    for (let i = 35; i >= 1; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i); const k = key(d), wd = d.getDay();
      const day = { date: k, weight: +(80 + (35 - i) * 0.015 + (i % 3) * 0.2).toFixed(1), bed: '23:10', wake: '06:40', kcal: 3600 + (i % 4) * 150, protein: 150 + (i % 5) * 10,
        training: i % 6 !== 0, habits: { mobil: true, hygiena: true, gauc: i % 4 !== 0, zapis: true }, energy: 1 + (i % 5),
        meals: [{ id: 'a' + i, t: '08:10', name: 'Ovesná kaše s whey', kcal: 900, protein: 50 }, { id: 'b' + i, t: '13:00', name: 'Rýže, kuře, olej', kcal: 1100, protein: 60 }], note: i % 7 === 0 ? 'Dobrý den, nohy těžké.' : '' };
      if (wd === 2) day.lifts = { bulgar: { w: 20 + (35 - i) / 7 * 2, r: 8 }, rdl: { w: 80 + (35 - i) / 7 * 2.5, r: 7 } };
      if (wd === 3) day.lifts = { bench: { w: 70 + (35 - i) / 7 * 2.5, r: 6 } };
      if (wd === 5) day.lifts = { pull: { w: 10, r: 8 }, ohp: { w: 50, r: 9 } };
      if (wd === 0) day.lifts = { incline: { w: 60 + (35 - i) / 7 * 2.5, r: 7 } };
      if ([1, 6].includes(wd) && i > 7) day.run = 'Tempo 6 km';
      days[k] = day;
    }
    localStorage.setItem('tvt-days', JSON.stringify(days));
    localStorage.setItem('tvt-settings', JSON.stringify({ startWeight: 80, startDate: Object.keys(days)[0], targetWeight: 95, kcalTarget: 4000, sleepTarget: 7, hmDate: '2027-06-30', proteinPerKg: 2 }));
  });
  await p.reload(); await p.waitForTimeout(600);
  console.log('mode:', await p.textContent('#mode'));
  console.log('runBanner visible:', await p.isVisible('#runBanner'), '| text:', await p.textContent('#runBannerTxt'));
  console.log('habits:', await p.$$eval('#habitBox .chk', els => els.map(e => e.textContent.trim())));
  await p.screenshot({ path: SP + '/m1_today.png', fullPage: true });
  // run week
  await p.click('#runBannerBtn');
  await p.fill('#wbText', `**Pondělí (10. 11.)** – Tempo\n- 15 min rozklus\n- 4× 1 km v 4:30/km\nPo rozklusu protažení\n**Středa:** volno\n### Čtvrtek\n30 min Z2\nSobota 15. 11.: Long run 14 km`);
  await p.click('#wbSplit');
  console.log('wbMsg:', await p.textContent('#wbMsg'));
  console.log('split:', await p.inputValue('#wb-1'), '|', await p.inputValue('#wb-4'), '|', await p.inputValue('#wb-6'));
  await p.screenshot({ path: SP + '/m2_week.png', fullPage: true });
  await p.click('#wbSave'); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); return Object.keys(d).filter(k => d[k].run && k >= '2026-11-09').map(k => k + ': ' + d[k].run.slice(0, 20)); });
  console.log('saved runs:', saved, 'banner now:', await p.isVisible('#runBanner'));
  // energy
  await p.click('#energyBox button[data-e="4"]'); await p.waitForTimeout(200);
  console.log('energy:', await p.textContent('#energyTxt'));
  // gym day lifts: today is ? 
  console.log('today dow', new Date().getDay(), 'exList hidden', await p.isHidden('#exList'));
  if (!(await p.isHidden('#exList'))) {
    const inp = await p.$$('#exList input[data-f="w"]');
    if (inp.length) { await inp[0].fill('27.5'); await p.locator('#exList input[data-f="r"]').first().fill('9'); await p.waitForTimeout(800); }
    console.log('lifts saved:', await p.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem('tvt-days'))[new Date().toISOString().slice(0,10)] || {}).lifts)));
    console.log('exlist:', (await p.textContent('#exList')).slice(0, 200));
  }
  await p.screenshot({ path: SP + '/m3_today_after.png', fullPage: true });
  // overview
  await p.click('nav.tabs button:nth-child(2)'); await p.waitForTimeout(400);
  console.log('kcalSuggest visible:', await p.isVisible('#kcalSuggest'), await p.textContent('#ksTxt'), await p.textContent('#ksApply'));
  await p.screenshot({ path: SP + '/m4_overview.png', fullPage: true });
  await p.click('#sumPrev'); await p.waitForTimeout(200);
  console.log('sum prev title:', await p.textContent('#sumTitle'), '| ins:', await p.textContent('#sumIns'));
  // settings PDF
  await p.click('nav.tabs button[data-view="settings"]'); await p.waitForTimeout(300);
  await p.selectOption('#exRange', '30');
  console.log('export head:', (await p.inputValue('#exText')).split('\n').slice(0, 6).join('\n'));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('#pdfBtn')]);
  await dl.saveAs(SP + '/report.pdf'); console.log('pdf:', dl.suggestedFilename(), await p.textContent('#pdfMsg'));
  await p.selectOption('#exRange', '7');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('#pdfBtn')]);
  await dl2.saveAs(SP + '/report7.pdf');
  await p.click('nav.tabs button:nth-child(3)'); await p.waitForTimeout(300);
  await p.screenshot({ path: SP + '/m5_hist.png' });
  // desktop
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.click('nav.tabs button:nth-child(2)'); await p.waitForTimeout(400);
  await p.screenshot({ path: SP + '/d1_overview.png', fullPage: true });
  await p.click('nav.tabs button:nth-child(1)'); await p.waitForTimeout(300);
  await p.screenshot({ path: SP + '/d2_today.png' });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push('P2 ' + e.message));
  await p2.clock.install({ time: new Date('2026-11-15T18:30:00') });
  await p2.goto(process.env.DEMO_URL); await p2.waitForTimeout(800);
  console.log('sunday banner:', await p2.isVisible('#sumBanner'), 'runBanner:', await p2.isVisible('#runBanner'));
  await p2.click('#sumBannerBtn'); await p2.waitForTimeout(400);
  console.log('after click', await p2.textContent('#sumLabel'), await p2.textContent('#sumTitle'));
  console.log('ERRORS:', errs.filter(e => !/TUNNEL/.test(e)));
  await b.close();
})();
