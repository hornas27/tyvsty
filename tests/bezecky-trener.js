// Smoke scénář: bezecky-trener – návrh týdne trenérem (demo AI) → náhled → Rozložit do dní; zápis běhu, rozbor, použití úpravy, dotaz
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem('tvt-days', JSON.stringify({ '2026-11-14': { date: '2026-11-14', run: '14 km lehce', training: true } })); localStorage.setItem('tvt-settings', JSON.stringify({ runProfile: 'Test profil: lehký běh 6:00/km, max tep 190.' })); });
  await p.reload(); await p.waitForTimeout(700);
  // 1) příští týden: pondělí 16. 11. → Naplánovat týden → Navrhne trenér
  await p.click('#nextDay'); await p.waitForTimeout(300);
  await p.click('#weekLink'); await p.waitForTimeout(200);
  await p.screenshot({ path: SP + '/t1_week.png', fullPage: true });
  await p.click('#wbCoach'); await p.waitForTimeout(800);
  const preview = await p.evaluate(() => ({ msg: document.getElementById('wbMsg').innerText, mon: document.getElementById('wb-1').value, thu: document.getElementById('wb-4').value, sat: document.getElementById('wb-6').value, visible: !document.getElementById('wbPreview').hidden }));
  await p.locator('#weekBox').screenshot({ path: SP + '/t2_preview.png' });
  await p.click('#wbSave'); await p.waitForTimeout(400);
  const planned = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); return { mon: d['2026-11-16'] && d['2026-11-16'].run, thu: d['2026-11-19'] && d['2026-11-19'].run, sat: d['2026-11-21'] && d['2026-11-21'].run }; });
  // 2) sobota 14. 11.: zápis běhu + rozbor
  await p.click('#goToday'); await p.waitForTimeout(300);
  await p.click('#prevDay'); await p.waitForTimeout(300);
  const logVisible = await p.isVisible('#runLog');
  await p.fill('#rl-km', '14.2'); await p.fill('#rl-time', '1:25:10'); await p.press('#rl-time', 'Tab'); await p.fill('#rl-hr', '152');
  await p.click('#rlFeel [data-feel="3"]'); await p.fill('#rl-note', 'Šlo to dobře, poslední 2 km těžší.'); await p.waitForTimeout(800);
  const pace = await p.textContent('#rlPace');
  await p.click('#rlReview'); await p.waitForTimeout(700);
  const review = await p.evaluate(() => document.getElementById('rlOut').innerText);
  await p.click('#rlApply'); await p.waitForTimeout(400);
  const applied = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tvt-days')); return { mon: d['2026-11-16'].run, log: d['2026-11-14'].runLog }; });
  // 3) dotaz
  await p.fill('#rlAsk', 'Můžu zítra do posilovny?'); await p.click('#rlAskBtn'); await p.waitForTimeout(600);
  const answer = await p.textContent('#rlAnswer');
  await p.locator('.blk-train').screenshot({ path: SP + '/t3_runlog.png' });
  // gym den nemá zápis běhu
  await p.click('#goToday'); await p.waitForTimeout(300);
  const gymHasLog = await p.isVisible('#runLog');
  console.log(JSON.stringify({ preview, planned, logVisible, pace, review, applied, answer, gymHasLog, errs }, null, 1)); await b.close(); })();
