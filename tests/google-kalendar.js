// Smoke scénář: google-kalendar – spouští se přes tests/run.js (vypíše JSON, kontroluje se ručně + pole errs musí být prázdné)
const { chromium } = require('playwright'); const SP = process.env.OUT;
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await p.clock.install({ time: new Date(process.env.FAKE_NOW) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const calls = []; const events = {}; let n = 0; let failNext = false; let tokReq = 0;
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:o=>{window.__tokReq=(window.__tokReq||0)+1;window.__prompt=o&&o.prompt;setTimeout(()=>c.callback({access_token:'T',expires_in:3600,scope:c.scope}),50)}}),hasGrantedAllScopes:()=>true,revoke:(t,cb)=>cb&&cb()}}};` }));
  await ctx.route('https://www.googleapis.com/calendar/v3/**', async r => {
    const req = r.request(), m = req.method(), u = new URL(req.url()), id = decodeURIComponent(u.pathname.split('/events')[1].slice(1) || '');
    const body = req.postData() ? JSON.parse(req.postData()) : null; calls.push(m + ' ' + (id || '-') + (body ? ' ' + body.summary + ' @' + body.start.dateTime + ' ' + body.start.timeZone : ''));
    if (failNext) { failNext = false; return r.fulfill({ status: 503, body: '{}' }); }
    if (req.headers().authorization !== 'Bearer T') return r.fulfill({ status: 401, body: '{}' });
    if (m === 'POST') { const e = { id: 'ev' + (++n), ...body }; events[e.id] = e; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(e) }); }
    if (m === 'PATCH') { if (!events[id]) return r.fulfill({ status: 404, body: '{}' }); Object.assign(events[id], body); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events[id]) }); }
    if (m === 'DELETE') { delete events[id]; return r.fulfill({ status: 204 }); }
  });
  await p.goto(process.env.DEMO_URL); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await p.reload(); await p.waitForTimeout(800);
  await p.click('nav.tabs button[data-view="notes"]'); await p.click('#folderEdit'); await p.fill('#folderNew', 'Úkoly'); await p.click('#folderAdd'); await p.waitForTimeout(300); await p.click('#folderEdit');
  const loc = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  const o = {}; const t1 = loc(new Date(+new Date(process.env.FAKE_NOW) + 2 * 3600e3)), t2 = loc(new Date(+new Date(process.env.FAKE_NOW) + 3 * 3600e3));
  o.modes = await p.$$eval('#calMode button', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')));
  o.hintApp = await p.textContent('#calHint');
  // 1) jen v appce -> žádné volání
  await p.fill('#noteText', 'Jen appka'); await p.fill('#noteRemind', t1); await p.click('#noteSave'); await p.waitForTimeout(300);
  o.callsAfterApp = calls.length;
  // 2) appka + kalendář bez času -> blok
  await p.click('#calMode button[data-m=both]'); o.hintBoth = await p.textContent('#calHint');
  await p.fill('#noteText', 'Bez casu'); await p.click('#noteSave'); await p.waitForTimeout(200); o.blockedNoTime = await p.inputValue('#noteText');
  // 3) appka + kalendář s časem -> POST
  await p.fill('#noteText', 'Trenink nohy\ndetail'); await p.fill('#noteRemind', t1); await p.click('#noteSave'); await p.waitForTimeout(600);
  o.afterBoth = calls.slice(); o.prompt = await p.evaluate(() => window.__prompt);
  o.meta = await p.$$eval('#noteList .note', e => e.map(x => x.querySelector('.note-t').textContent.split('\n')[0] + ' — ' + x.querySelector('small').textContent));
  o.modeRemembered = await p.$eval('#calMode button.on', x => x.dataset.m);
  // 4) úprava času -> PATCH
  await p.click('#noteList .note-t >> text=Trenink nohy'); await p.click('#noteList .note.open button[data-act=edit]');
  o.editMode = await p.$eval('#calMode button.on', x => x.dataset.m);
  await p.fill('#noteRemind', t2); await p.click('#noteSave'); await p.waitForTimeout(500);
  // 5) hotovo -> DELETE, zpět -> POST
  await p.click('#noteList .note:has-text("Trenink nohy") .tchk'); await p.waitForTimeout(500);
  await p.click('#noteList .note:has-text("Trenink nohy") .tchk'); await p.waitForTimeout(500);
  // 6) jen kalendář + výpadek -> čeká na kalendář, pak synchronizovat
  await p.click('#calMode button[data-m=cal]'); failNext = true;
  await p.fill('#noteText', 'Jen kalendar'); await p.fill('#noteRemind', loc(new Date(+new Date(process.env.FAKE_NOW) - 60e3))); await p.click('#noteSave'); await p.waitForTimeout(600);
  o.pendingMeta = await p.$eval('#noteList .note:has-text("Jen kalendar") small', x => x.textContent);
  o.retryBtn = await p.isVisible('#calRetry') ? await p.textContent('#calRetry') : 'skryto';
  o.toastForCalOnly = await p.isVisible('#remindToast') ? await p.textContent('#rtText') : 'nic';
  await p.click('#calRetry'); await p.waitForTimeout(600);
  o.afterRetryMeta = await p.$eval('#noteList .note:has-text("Jen kalendar") small', x => x.textContent);
  o.retryHidden = !(await p.isVisible('#calRetry'));
  // 7) přidat do kalendáře u appkového úkolu
  await p.click('#noteList .note-t >> text=Jen appka'); o.tocalBtn = await p.isVisible('#noteList .note.open button[data-act=tocal]');
  await p.click('#noteList .note.open button[data-act=tocal]'); await p.waitForTimeout(500);
  // 8) smazat -> DELETE
  await p.click('#noteList .note-t >> text=Jen kalendar'); await p.click('#noteList .note.open button[data-act=del]'); await p.click('#noteList .note.open button[data-act=del]'); await p.waitForTimeout(500);
  o.tokenRequests = await p.evaluate(() => window.__tokReq);
  o.calls = calls; o.eventsLeft = Object.values(events).map(e => e.summary + ' @' + e.start.dateTime + ' popup:' + e.reminders.overrides[0].minutes);
  o.stored = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('tvt-notes'))).filter(n => n.folder !== 'kodex').map(n => n.text.split('\n')[0] + ' mode:' + n.calMode + ' ev:' + n.calEventId + ' pend:' + n.calPending + ' done:' + n.done));
  o.gcalOffVisible = await p.isVisible('#gcalOff');
  await p.screenshot({ path: SP + '/u3_cal.png' });
  // reload: token ze session → žádné nové přihlášení při další změně
  await p.reload(); await p.waitForTimeout(800); await p.click('nav.tabs button[data-view="notes"]'); await p.click('#folderBar button:has-text("Úkoly")');
  await p.click('#noteList .note:has-text("Jen appka") .tchk'); await p.waitForTimeout(500);
  o.tokReqAfterReload = await p.evaluate(() => window.__tokReq || 0); o.lastCall = calls[calls.length - 1];
  console.log(JSON.stringify({ ...o, errs }, null, 1)); await b.close(); })();
