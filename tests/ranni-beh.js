// Smoke scénář: ranni-beh – zápis ranního běhu popisem i ze screenshotu (demo AI), odškrtnutí návyku, započítání do km v Přehledu a reportu
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-20T09:00:00') }); // pátek; návyk Ranní běh platí od 16. 11.
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.env.DEMO_URL); await p.waitForTimeout(500);
  await p.evaluate(() => { localStorage.setItem('tvt-days', JSON.stringify({ '2026-11-16': { date: '2026-11-16', training: true, runLog: { km: 8, sec: 2520, hr: 158 } } })); });
  await p.reload(); await p.waitForTimeout(700);
  const sel = '#habitBox [data-id="h-rannibeh"]';
  const hasHabit = await p.isVisible(sel);
  // 1) odškrtnutí návyku otevře zápis → popis „4 km, 5:30/km“
  await p.click(sel); await p.waitForTimeout(300);
  const formOpen = await p.isVisible('#mrText');
  await p.fill('#mrText', '4 km, 5:30/km tep 142');
  await p.locator('#habitBox').screenshot({ path: SP + '/r1_form.png' });
  await p.click('[data-mr="save"]'); await p.waitForTimeout(400);
  const day20 = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days'))['2026-11-20']);
  const summary = await p.textContent('#mrunBox');
  // 2) středa 18. 11.: ze screenshotu
  await p.click('#prevDay'); await p.waitForTimeout(150); await p.click('#prevDay'); await p.waitForTimeout(300);
  await p.click('[data-mr="open"]'); await p.waitForTimeout(200);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('#mr-photo', { name: 'beh.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(900);
  const photoForm = await p.evaluate(() => ({ km: document.getElementById('mrKm').value, time: document.getElementById('mrTime').value, hr: document.getElementById('mrHr').value, msg: document.getElementById('mrMsg').textContent }));
  await p.click('[data-mr="save"]'); await p.waitForTimeout(400);
  const day18 = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days'))['2026-11-18']);
  // 3) popis „3,5 km za 20 min“ v úterý přes Enter
  await p.click('#prevDay'); await p.waitForTimeout(300);
  await p.click('[data-mr="open"]'); await p.fill('#mrText', '3,5 km za 20 min'); await p.press('#mrText', 'Enter'); await p.waitForTimeout(400);
  const day17 = await p.evaluate(() => JSON.parse(localStorage.getItem('tvt-days'))['2026-11-17'].morningRun);
  // 4) Přehled → Běh
  await p.click('nav.tabs button[data-view="overview"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelector('#runCard details').open = true; }); await p.waitForTimeout(200);
  const overview = await p.evaluate(() => ({ stats: document.getElementById('runStats').innerText, list: document.getElementById('runList').innerText, status: document.getElementById('runStatus').innerText }));
  await p.locator('#runCard').screenshot({ path: SP + '/r2_runcard.png' });
  // 5) report pro Gemini
  await p.click('nav.tabs button[data-view="today"]'); await p.waitForTimeout(300);
  await p.click('#goToday').catch(() => {}); await p.waitForTimeout(200);
  await p.click('#runBannerBtn').catch(async () => { await p.click('#nextDay'); await p.click('#weekLink'); });
  await p.waitForTimeout(200);
  await p.click('#wbReport'); await p.waitForTimeout(300);
  const report = await p.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
  console.log(JSON.stringify({ hasHabit, formOpen, day20, summary, photoForm, day18, day17, overview, reportRanni: report.split('\n').filter(l => /ranní/i.test(l)), errs }, null, 1)); await b.close(); })();
