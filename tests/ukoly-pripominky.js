// Smoke scénář: ukoly-pripominky – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.DEMO_URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  await p.click('nav.tabs button[data-view="notes"]'); await p.click('#folderEdit'); await p.fill('#folderNew', 'Úkoly'); await p.click('#folderAdd'); await p.waitForTimeout(300); await p.click('#folderEdit');
  const o = {};
  o.remindRowVisible = await p.isVisible('#remindRow'); o.label = await p.textContent('#noteLabel');
  const loc = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  // úkol s připomínkou za 2 h a úkol s připomínkou před 1 min
  await p.fill('#noteText', 'Zavolat do banky'); await p.fill('#noteRemind', loc(new Date(+new Date(process.env.FAKE_NOW) + 2 * 3600e3))); await p.click('#noteSave'); await p.waitForTimeout(200);
  await p.fill('#noteText', 'Vyfotit produkt'); await p.fill('#noteRemind', loc(new Date(+new Date(process.env.FAKE_NOW) - 60e3))); await p.click('#noteSave'); await p.waitForTimeout(400);
  await p.fill('#noteText', 'Koupit vločky'); await p.click('#noteSave'); await p.waitForTimeout(200);
  o.toast = await p.isVisible('#remindToast') ? await p.textContent('#rtTitle') + ' | ' + await p.textContent('#rtText') : 'nic';
  o.list = await p.$$eval('#noteList .note', e => e.map(x => (x.classList.contains('done') ? '[x] ' : '[ ] ') + x.querySelector('.note-t').textContent + ' — ' + ((x.querySelector('small') || {}).textContent || '')));
  await p.screenshot({ path: SP + '/u1_tasks.png' });
  await p.click('#rtLater'); await p.waitForTimeout(200); o.afterSnooze = await p.isVisible('#remindToast');
  // otevři úkol -> kalendář
  await p.click('#noteList .note-t >> text=Zavolat do banky'); await p.waitForTimeout(100);
  o.tocal = await p.isVisible('#noteList .note.open button[data-act=tocal]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#noteList .note.open button[data-act=ics]')]);
  const fs = require('fs'); await dl.saveAs(SP + '/ukol.ics'); o.ics = fs.readFileSync(SP + '/ukol.ics', 'utf8').split('\r\n').filter(l => /DTSTART|SUMMARY|TRIGGER/.test(l));
  // odškrtnout
  await p.click('#noteList .note:has-text("Koupit vločky") .tchk'); await p.waitForTimeout(200);
  o.afterDone = await p.$$eval('#noteList .note', e => e.map(x => (x.classList.contains('done') ? '[x] ' : '[ ] ') + x.querySelector('.note-t').textContent));
  // Dnes: úkoly na dnes
  await p.click('nav.tabs button[data-view="today"]'); await p.waitForTimeout(300);
  o.todayCard = await p.isVisible('#taskCard') ? await p.$$eval('#taskList li', e => e.map(x => x.textContent.trim().replace(/\s+/g, ' '))) : 'skryto';
  await p.screenshot({ path: SP + '/u2_today.png' });
  // reload -> uloženo, připomínka se neopakuje
  await p.reload(); await p.waitForTimeout(800); o.toastAfterReload = await p.isVisible('#remindToast');
  console.log(JSON.stringify({ ...o, errs }, null, 1)); await b.close(); })();
