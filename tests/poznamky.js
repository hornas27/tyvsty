// Smoke scénář: poznamky – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.DEMO_URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  await p.click('nav.tabs button[data-view="notes"]'); await p.waitForTimeout(400);
  const o = {};
  o.folders = await p.$$eval('#folderBar .fchip', e => e.map(x => x.textContent.trim()));
  o.activeHead = await p.textContent('#noteHead');
  await p.click('.fchip[data-f="kodex"]'); await p.waitForTimeout(200);
  o.kodex = await p.$$eval('#noteList .note', e => e.map(x => x.querySelector('.note-n').textContent + '. ' + x.querySelector('.note-t').textContent));
  // přidej pravidlo 13 do Kodexu
  await p.fill('#noteText', 'Disciplína je svoboda.'); await p.click('#noteSave'); await p.waitForTimeout(200);
  o.kodexLast = await p.$eval('#noteList .note:last-child', x => x.textContent.replace(/\s+/g, ' ').slice(0, 40));
  // myšlenka
  await p.click('.fchip[data-f="myslenky"]'); await p.fill('#noteText', 'Ráno nejdřív nejtěžší úkol.\nPak mail.'); await p.click('#noteSave'); await p.waitForTimeout(200);
  // upravit
  await p.click('#noteList .note-t'); await p.click('#noteList .note button[data-act="edit"]'); await p.fill('#noteText', 'Ráno nejdřív nejtěžší úkol.'); await p.click('#noteSave'); await p.waitForTimeout(200);
  o.myslenky = await p.$$eval('#noteList .note-t', e => e.map(x => x.textContent));
  // přesun do Nápady
  await p.click('#noteList .note-t'); await p.selectOption('#noteList .note select', 'napady'); await p.waitForTimeout(200);
  o.afterMove = await p.$$eval('#folderBar .fchip', e => e.map(x => x.textContent.trim()));
  // nová složka
  await p.click('#folderEdit'); await p.fill('#folderNew', 'Citáty'); await p.click('#folderAdd'); await p.waitForTimeout(300);
  o.withNew = await p.$$eval('#folderBar .fchip', e => e.map(x => x.textContent.trim()));
  // hledání
  await p.click('#folderEdit'); await p.fill('#noteSearch', 'ty vs'); await p.waitForTimeout(200);
  o.search = await p.$$eval('#noteList .note-t', e => e.map(x => x.textContent));
  await p.fill('#noteSearch', '');
  // smazat (2 kliky)
  await p.click('.fchip[data-f="napady"]'); await p.click('#noteList .note-t'); await p.click('#noteList .note button[data-act="del"]'); await p.click('#noteList .note button[data-act="del"]'); await p.waitForTimeout(200);
  o.napadyAfterDel = await p.$$eval('#noteList .note', e => e.length);
  // perzistence po reloadu + žádné druhé seedování
  await p.reload(); await p.waitForTimeout(700); await p.click('nav.tabs button[data-view="notes"]'); await p.waitForTimeout(300);
  o.afterReload = await p.$$eval('#folderBar .fchip', e => e.map(x => x.textContent.trim()));
  await p.click('.fchip[data-f="kodex"]'); await p.waitForTimeout(200);
  await p.screenshot({ path: SP + '/n1_notes.png', fullPage: true });
  o.overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  o.navLabels = await p.$$eval('#tabs button', e => e.map(x => x.textContent.trim()));
  console.log(JSON.stringify({ ...o, errs }, null, 1)); await b.close(); })();
