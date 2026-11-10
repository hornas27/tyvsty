/* Ty vs. Ty — osobní tracker (Marek). Vanilla JS + Firebase (Auth email/heslo + Firestore). */
(function () {
  "use strict";

  // ---------- plán týdne (0 = neděle) ----------
  const PLAN = {
    1: { type: "run", label: "Tempo / intervaly" },
    2: { type: "gym", label: "Nohy", ex: [
      ["Bulharské dřepy (smith)", "3×8–10 / noha"], ["Rumunský mrtvý tah", "3×8–10"], ["Leg press", "3×10–12"],
      ["Zákopy", "3×10–12"], ["Předkopy", "3×12–15"], ["Třísla", "2–3×12–15"], ["Lýtka", "3–4×12–15"]] },
    3: { type: "gym", label: "Hrudník + biceps", ex: [
      ["Smith bench", "3×6–8"], ["Šikmý tlak s jednoručkami", "3×8–10"], ["Rozpažky na stroji", "3×12–15"],
      ["Upažování na kladce", "3×12–15"], ["Bayesian curl", "3×10–12"], ["Zdvih s lanem na kladce", "3×10–12"], ["Kladkový crunch v kleku", "3×12–15"]] },
    4: { type: "run", label: "Chill run", optional: true },
    5: { type: "gym", label: "Záda + ramena + triceps", ex: [
      ["Shyby se závažím / stahování na stroji", "4×6–10"], ["Přítahy úzké kladky vsedě", "3×10–12"], ["Úzké stahování kladky", "3×10–12"],
      ["Tlaky na ramena na stroji", "3×8–10"], ["Zadní ramena na stroji", "3×15"], ["Triceps za hlavou na kladce", "3×10–12"],
      ["Stahování kladky jednoruč", "3×12"], ["Hyperextenze se závažím", "3×10–12"]] },
    6: { type: "run", label: "Long run" },
    0: { type: "gym", label: "Celý hořejšek", ex: [
      ["Smith incline bench", "3×8–10"], ["Přítahy vsedě širokým úchopem", "3×10–12"], ["Upažování na kladce", "3×12–15"],
      ["Zadní ramena na kladce", "3×12–15"], ["Triceps za hlavou", "2–3×12"], ["Bayesian curl", "2–3×12"]] }
  };
  const PLAN_AHEAD_DAYS = 14; // dopředu jde vložit běh z Gemini až na 14 dní
  const REQUIRED_PER_WEEK = Object.values(PLAN).filter(p => !p.optional).length; // 6
  const HABITS = [
    { k: "mobil", t: "Mobil od 21:00 mimo dosah" },
    { k: "hygiena", t: "Hygiena a pleť" },
    { k: "gauc", t: "Nespal jsem na gauči" },
    { k: "zapis", t: "Zápis do sešitu" }
  ];
  const DEFAULT_SETTINGS = { startWeight: null, startDate: null, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7, hmDate: "2027-06-30" };
  const DAYS_CS = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  const DAYS_SHORT = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

  // ---------- utils ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const toKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  const todayKey = () => toKey(new Date());
  const fmtDate = k => { const d = parseKey(k); return DAYS_CS[d.getDay()].slice(0, 2) + " " + d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); };
  const fmtShort = k => { const d = parseKey(k); return d.getDate() + ". " + (d.getMonth() + 1) + "."; };
  const nf1 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
  const num = v => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
  const mondayOf = k => { const d = parseKey(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toKey(d); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function sleepHours(bed, wake) {
    if (!bed || !wake) return null;
    const [bh, bm] = bed.split(":").map(Number), [wh, wm] = wake.split(":").map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins <= 0) mins += 1440;
    return mins / 60;
  }
  const fmtH = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + " h " + pad(m % 60) + " min"; };

  // ---------- state ----------
  const state = { days: {}, settings: { ...DEFAULT_SETTINGS }, key: todayKey(), view: "today", formKey: null, loaded: false };

  // ---------- store (Firebase nebo demo) ----------
  const cfg = window.FIREBASE_CONFIG || {};
  const DEMO = !cfg.apiKey || String(cfg.apiKey).startsWith("VLOZ") || typeof firebase === "undefined";
  let store;

  function makeDemoStore() {
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    let daysCb = () => {}, setCb = () => {};
    return {
      label: "Demo · data jen v tomto zařízení",
      onAuth(cb) { setTimeout(() => cb({ email: "demo režim" }), 0); },
      signIn() {}, signUp() {}, signOut() { },
      watchDays(cb) { daysCb = cb; cb(read("tvt-days", {})); },
      watchSettings(cb) { setCb = cb; cb(read("tvt-settings", {})); },
      saveDay(k, data) { const all = read("tvt-days", {}); all[k] = data; write("tvt-days", all); return Promise.resolve(); },
      saveSettings(s) { write("tvt-settings", s); setCb(s); return Promise.resolve(); }
    };
  }

  function makeFirebaseStore() {
    firebase.initializeApp(cfg);
    const auth = firebase.auth();
    const db = firebase.firestore();
    try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
    let uid = null, unsubs = [];
    const userRef = () => db.collection("users").doc(uid);
    return {
      label: "Synchronizováno",
      onAuth(cb) { auth.onAuthStateChanged(u => { uid = u ? u.uid : null; unsubs.forEach(f => f()); unsubs = []; cb(u); }); },
      signIn: (e, p) => auth.signInWithEmailAndPassword(e, p),
      signUp: (e, p) => auth.createUserWithEmailAndPassword(e, p),
      signOut: () => auth.signOut(),
      watchDays(cb) {
        unsubs.push(userRef().collection("days").onSnapshot(snap => {
          const out = {}; snap.forEach(d => { out[d.id] = d.data(); }); cb(out);
        }, err => showSave("Chyba načtení: " + err.code)));
      },
      watchSettings(cb) {
        unsubs.push(userRef().collection("meta").doc("settings").onSnapshot(d => cb(d.exists ? d.data() : {}), () => {}));
      },
      saveDay: (k, data) => userRef().collection("days").doc(k).set(data),
      saveSettings: s => userRef().collection("meta").doc("settings").set(s)
    };
  }

  // ---------- save handling ----------
  let saveTimer = null, saveMsgTimer = null;
  function showSave(t) {
    const el = $("saveState"); el.textContent = t; el.style.opacity = 1;
    clearTimeout(saveMsgTimer); saveMsgTimer = setTimeout(() => { el.style.opacity = 0; }, 1800);
  }
  function currentDay() { return state.days[state.key] || {}; }
  function patchDay(patch, immediate) {
    const k = state.key;
    const d = { ...(state.days[k] || {}), ...patch, date: k, updatedAt: Date.now() };
    if (patch.habits) d.habits = { ...((state.days[k] || {}).habits || {}), ...patch.habits };
    state.days[k] = d;
    clearTimeout(saveTimer);
    const run = () => { saveTimer = null; store.saveDay(k, state.days[k]).then(() => showSave("Uloženo ✓")).catch(e => showSave("Neuloženo: " + (e.code || e.message))); };
    if (immediate) run(); else saveTimer = setTimeout(run, 600);
    renderTodayDerived();
  }

  // ---------- TODAY ----------
  const checkSvg = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L19 7"/></svg>';
  function chkHtml(id, title, sub, on, extraCls, pill) {
    return `<button type="button" class="chk ${extraCls || ""}" role="checkbox" aria-checked="${on ? "true" : "false"}" data-id="${id}">
      <span class="box">${checkSvg}</span><span class="tx"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${pill || ""}</button>`;
  }

  function fillForm() {
    const d = currentDay();
    $("f-weight").value = d.weight ?? "";
    $("f-bed").value = d.bed ?? "";
    $("f-wake").value = d.wake ?? "";
    $("f-kcal").value = d.kcal ?? "";
    $("f-note").value = d.note ?? "";
    $("f-run").value = d.run ?? "";
    state.formKey = state.key;
  }

  function renderToday() {
    const k = state.key, tk = todayKey();
    const wd = parseKey(k).getDay();
    $("dayTitle").textContent = k === tk ? "Dnes" : k === addDays(tk, -1) ? "Včera" : k === addDays(tk, 1) ? "Zítra" : DAYS_CS[wd][0].toUpperCase() + DAYS_CS[wd].slice(1);
    $("daySub").textContent = fmtDate(k);
    $("nextDay").disabled = k >= addDays(tk, PLAN_AHEAD_DAYS);
    $("goToday").hidden = k === tk;
    if (state.formKey !== k) fillForm();

    const d = currentDay(), p = PLAN[wd];
    const pill = `<span class="pill ${p.optional ? "opt" : p.type}">${p.optional ? "volitelně" : p.type === "gym" ? "gym" : "běh"}</span>`;
    $("trainBox").innerHTML = chkHtml("training", (p.type === "gym" ? "Gym · " : "Běh · ") + p.label, "Splněno", !!d.training, "train", pill);
    $("exList").hidden = p.type !== "gym";
    $("runField").hidden = p.type !== "run";
    if (p.type === "gym") $("exList").innerHTML = p.ex.map((e, i) => `<li><i>${i + 1}</i><span>${esc(e[0])}</span><b>${esc(e[1])}</b></li>`).join("");
    $("habitBox").innerHTML = HABITS.map(h => chkHtml("h-" + h.k, h.t, "", !!(d.habits || {})[h.k])).join("");
    renderTodayDerived();
  }

  function renderTodayDerived() {
    const d = currentDay(), s = state.settings;
    const h = sleepHours(d.bed, d.wake);
    $("sleepHint").textContent = h != null ? "Spánek: " + fmtH(h) + (h < s.sleepTarget ? " · pod cílem " + s.sleepTarget + " h" : " ✓") : "";
    if (d.kcal != null) {
      const diff = s.kcalTarget - d.kcal;
      $("kcalHint").textContent = diff > 0 ? "Chybí " + nf0.format(diff) + " kcal do " + nf0.format(s.kcalTarget) : "Cíl " + nf0.format(s.kcalTarget) + " kcal splněn ✓";
    } else $("kcalHint").textContent = "";
    document.querySelectorAll("#trainBox .chk, #habitBox .chk").forEach(el => {
      const id = el.dataset.id;
      const on = id === "training" ? !!d.training : !!(d.habits || {})[id.slice(2)];
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function bindToday() {
    $("prevDay").onclick = () => { state.key = addDays(state.key, -1); renderToday(); };
    $("nextDay").onclick = () => { if (state.key < addDays(todayKey(), PLAN_AHEAD_DAYS)) { state.key = addDays(state.key, 1); renderToday(); } };
    $("goToday").onclick = () => { state.key = todayKey(); renderToday(); };
    const numField = (id, key) => $(id).addEventListener("input", e => patchDay({ [key]: num(e.target.value) }));
    numField("f-weight", "weight"); numField("f-kcal", "kcal");
    $("f-bed").addEventListener("change", e => patchDay({ bed: e.target.value || null }));
    $("f-wake").addEventListener("change", e => patchDay({ wake: e.target.value || null }));
    $("f-note").addEventListener("input", e => patchDay({ note: e.target.value }));
    $("f-run").addEventListener("input", e => patchDay({ run: e.target.value }));
    const toggle = e => {
      const el = e.target.closest(".chk"); if (!el) return;
      const id = el.dataset.id, d = currentDay();
      if (id === "training") patchDay({ training: !d.training }, true);
      else { const hk = id.slice(2); patchDay({ habits: { [hk]: !(d.habits || {})[hk] } }, true); }
    };
    $("trainBox").addEventListener("click", toggle);
    $("habitBox").addEventListener("click", toggle);
  }

  // ---------- stats ----------
  function weightsBetween(fromK, toK) {
    const out = [];
    for (let k = fromK; k <= toK; k = addDays(k, 1)) { const w = (state.days[k] || {}).weight; if (w != null) out.push(w); }
    return out;
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function avg7(endK) { const w = weightsBetween(addDays(endK, -6), endK); return w.length >= 2 ? avg(w) : (w.length ? w[0] : null); }
  function allHabits(d) { return d && d.habits && HABITS.every(h => d.habits[h.k]); }
  function streaks() {
    const tk = todayKey();
    let k = allHabits(state.days[tk]) ? tk : addDays(tk, -1), cur = 0;
    while (allHabits(state.days[k])) { cur++; k = addDays(k, -1); }
    let best = 0, run = 0;
    const keys = Object.keys(state.days).sort();
    if (keys.length) for (let k2 = keys[0]; k2 <= tk; k2 = addDays(k2, 1)) { if (allHabits(state.days[k2])) { run++; best = Math.max(best, run); } else run = 0; }
    return { cur, best };
  }
  function firstWeight() { const ks = Object.keys(state.days).filter(k => state.days[k].weight != null).sort(); return ks.length ? state.days[ks[0]].weight : null; }
  function lastWeight() { const ks = Object.keys(state.days).filter(k => state.days[k].weight != null).sort(); return ks.length ? state.days[ks[ks.length - 1]].weight : null; }

  // ---------- charts ----------
  function lineChart(points, avgPts, target, W) {
    W = Math.max(300, W || 640); const H = W < 500 ? 210 : 260, L = 38, R = 12, T = 12, B = 26;
    if (points.length < 2) return `<p class="empty">Graf se ukáže po 2 zápisech váhy.</p>`;
    const vals = points.map(p => p.y);
    let lo = Math.min(...vals) - 0.8, hi = Math.max(...vals) + 0.8;
    const showT = target != null && target <= hi + 4 && target >= lo - 4;
    if (showT) { lo = Math.min(lo, target - 0.5); hi = Math.max(hi, target + 0.5); }
    const n = points[points.length - 1].x || 1;
    const sx = x => L + (x / n) * (W - L - R), sy = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    let g = "";
    const step = (hi - lo) / 4;
    for (let i = 0; i <= 4; i++) { const y = lo + step * i; g += `<line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${sy(y) + 3}" text-anchor="end">${nf1.format(y)}</text>`; }
    if (showT) g += `<line x1="${L}" x2="${W - R}" y1="${sy(target)}" y2="${sy(target)}" stroke="var(--clay)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${sy(target) - 5}" text-anchor="end" style="fill:var(--clay)">cíl ${nf0.format(target)} kg</text>`;
    const dots = points.map(p => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.6" fill="var(--soft)" opacity=".55"/>`).join("");
    const path = avgPts.length > 1 ? `<path d="${avgPts.map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1)).join(" ")}" fill="none" stroke="var(--sage)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : "";
    const lastA = avgPts[avgPts.length - 1];
    const end = lastA ? `<circle cx="${sx(lastA.x)}" cy="${sy(lastA.y)}" r="4.5" fill="var(--sage)" stroke="var(--card)" stroke-width="2"/>` : "";
    const xl = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].map((p, i) => `<text x="${sx(p.x)}" y="${H - 8}" text-anchor="${["start", "middle", "end"][i]}">${fmtShort(p.k)}</text>`).join("");
    const note = !showT && target != null ? `<text x="${W - R}" y="${T + 10}" text-anchor="end" style="fill:var(--clay)">cíl ${nf0.format(target)} kg ↑</text>` : "";
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf váhy">${g}${dots}${path}${end}${xl}${note}</svg>
      <div class="hint">Tečky = denní vážení · čára = průměr 7 dní</div>`;
  }

  function barChart(items, target, fmt, unitLabel, W) {
    W = Math.max(280, W || 320); const H = 180, L = 34, R = 6, T = 10, B = 22;
    const vals = items.map(i => i.v).filter(v => v != null);
    if (!vals.length) return `<p class="empty">Zatím žádná data.</p>`;
    const hi = Math.max(target * 1.15, ...vals) || 1;
    const sy = y => T + (1 - y / hi) * (H - T - B);
    const bw = (W - L - R) / items.length;
    let g = "";
    [0, target].forEach(y => { g += `<line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="${y ? "var(--clay)" : "var(--line)"}" ${y ? 'stroke-dasharray="4 3"' : ""} stroke-width="1"/>`; });
    g += `<text x="${L - 4}" y="${sy(target) + 3}" text-anchor="end">${fmt(target)}</text>`;
    items.forEach((it, i) => {
      const x = L + i * bw + bw * 0.18, w = bw * 0.64;
      if (it.v != null) { const y = sy(it.v); g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(sy(0) - y).toFixed(1)}" rx="3" fill="${it.v >= target ? "var(--sage)" : "var(--sage-l)"}" stroke="var(--sage)" stroke-width="${it.v >= target ? 0 : 1}"><title>${fmtShort(it.k)}: ${fmt(it.v)} ${unitLabel}</title></rect>`; }
      else g += `<circle cx="${(x + w / 2).toFixed(1)}" cy="${sy(0) - 3}" r="1.6" fill="var(--line)"/>`;
      if (i % 2 === 0 || items.length <= 7) g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${DAYS_SHORT[parseKey(it.k).getDay()]}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sloupcový graf">${g}</svg>`;
  }

  // ---------- OVERVIEW ----------
  function renderOverview() {
    const s = state.settings, tk = todayKey();
    $("tgtW").textContent = $("tgtW2").textContent = nf0.format(s.targetWeight);
    const cur = avg7(tk), prev = avg7(addDays(tk, -7));
    const nowW = weightsBetween(addDays(tk, -6), tk), prevW = weightsBetween(addDays(tk, -13), addDays(tk, -7));
    $("k-avg").innerHTML = cur != null ? nf1.format(cur) + "<small>kg</small>" : "—";
    $("k-avgS").textContent = nowW.length + "× vážení za 7 dní";
    let rate = null;
    if (nowW.length >= 2 && prevW.length >= 2) rate = cur - prev;
    $("k-rate").innerHTML = rate != null ? (rate >= 0 ? "+" : "") + nf1.format(rate) + "<small>kg</small>" : "—";
    $("k-rateS").textContent = rate != null ? "oproti předchozímu týdnu" : "potřeba 2 týdny dat";
    let st = '<span class="status none">Sbírám data</span>';
    if (rate != null) {
      rate = Math.round(rate * 10) / 10;
      if (rate < 0.25) st = '<span class="status warn">Pomalé · přidej 200 kcal</span>';
      else if (rate <= 0.5) st = '<span class="status good">Ideální tempo 0,25–0,5 kg</span>';
      else st = '<span class="status bad">Moc rychle · uber 200 kcal</span>';
    }
    $("rateStatus").innerHTML = st;

    const start = s.startWeight ?? firstWeight(), now = cur ?? lastWeight();
    if (start != null && now != null && s.targetWeight > start) {
      const pct = Math.max(0, Math.min(1, (now - start) / (s.targetWeight - start)));
      $("goalBar").style.width = (pct * 100).toFixed(1) + "%";
      $("goalTxt").textContent = nf1.format(now) + " / " + nf0.format(s.targetWeight) + " kg · zbývá " + nf1.format(Math.max(0, s.targetWeight - now));
      if (rate != null && rate > 0.05 && now < s.targetWeight) {
        const wk = (s.targetWeight - now) / rate; const eta = parseKey(addDays(tk, Math.round(wk * 7)));
        $("etaTxt").textContent = "Při současném tempu: " + eta.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
      } else $("etaTxt").textContent = start != null ? "Start: " + nf1.format(start) + " kg" : "";
    } else { $("goalBar").style.width = "0%"; $("goalTxt").textContent = now != null ? nf1.format(now) + " kg" : "—"; $("etaTxt").textContent = "Doplň startovní váhu v Nastavení."; }

    // week
    const mon = mondayOf(tk);
    let done = 0, bonus = 0, hDone = 0, hTotal = 0, grid = "";
    for (let i = 0; i < 7; i++) {
      const k = addDays(mon, i), d = state.days[k] || {}, p = PLAN[parseKey(k).getDay()];
      if (d.training) { if (p.optional) bonus++; else done++; }
      if (k <= tk) { hTotal += HABITS.length; hDone += HABITS.filter(h => (d.habits || {})[h.k]).length; }
      const parts = HABITS.filter(h => (d.habits || {})[h.k]).length + (p.optional ? 0 : (d.training ? 1 : 0));
      const max = HABITS.length + (p.optional ? 0 : 1);
      const cls = k > tk ? "" : parts >= max ? "full" : parts > 0 ? "part" : "";
      grid += `<div class="wg">${DAYS_SHORT[parseKey(k).getDay()]}<i class="${cls} ${k === tk ? "today" : ""}" title="${fmtShort(k)}: ${parts}/${max}"></i></div>`;
    }
    $("k-train").innerHTML = done + "<small>/ " + REQUIRED_PER_WEEK + "</small>";
    $("k-trainS").textContent = bonus ? "+ chill run" : "4 gym + 2 běhy";
    $("k-hab").innerHTML = hTotal ? Math.round(hDone / hTotal * 100) + "<small>%</small>" : "—";
    $("weekGrid").innerHTML = grid;
    const sk = streaks();
    $("k-streak").innerHTML = sk.cur + "<small>dní</small>";
    $("k-streakS").textContent = "rekord " + sk.best + " · cíl 30";
    const sl = []; for (let i = 0; i < 7; i++) { const d = state.days[addDays(tk, -i)] || {}; const h = sleepHours(d.bed, d.wake); if (h != null) sl.push(h); }
    const sa = avg(sl);
    $("k-sleep").innerHTML = sa != null ? nf1.format(sa) + "<small>h</small>" : "—";
    $("k-sleepS").textContent = "cíl " + nf1.format(s.sleepTarget) + " h";

    // charts
    const from = addDays(tk, -59), pts = [], aPts = [];
    for (let i = 0, k = from; k <= tk; i++, k = addDays(k, 1)) {
      const w = (state.days[k] || {}).weight;
      if (w != null) { pts.push({ x: i, y: w, k }); const a = avg7(k); if (a != null) aPts.push({ x: i, y: a }); }
    }
    if (pts.length) { const x0 = pts[0].x; pts.forEach(p => p.x -= x0); aPts.forEach(p => p.x -= x0); }
    $("wChart").innerHTML = lineChart(pts, aPts, s.targetWeight, $("wChart").clientWidth);
    const last14 = []; for (let i = 13; i >= 0; i--) { const k = addDays(tk, -i); last14.push(k); }
    $("kChart").innerHTML = barChart(last14.map(k => ({ k, v: (state.days[k] || {}).kcal ?? null })), s.kcalTarget, v => nf0.format(v), "kcal", $("kChart").clientWidth);
    $("sChart").innerHTML = barChart(last14.map(k => { const d = state.days[k] || {}; return { k, v: sleepHours(d.bed, d.wake) }; }), s.sleepTarget, v => nf1.format(v), "h", $("sChart").clientWidth);

    // goals
    const hm = s.hmDate ? parseKey(s.hmDate) : null;
    const wksToHm = hm ? Math.max(0, Math.round((hm - parseKey(tk)) / (7 * 864e5))) : null;
    const m = parseKey(tk).getMonth(); // 0-11
    const phase = (m >= 10 || m <= 1) ? "Fáze 1 · Objem (lis–úno): priorita váha, běh udržovat"
      : (m <= 3) ? "Fáze 2 · Přechod (bře–dub): váhu držet, běh nahoru"
      : (m <= 5) ? "Fáze 3 · Půlmaraton (kvě–čvn): gym a běh 50/50" : "Po půlmaratonu";
    const bar = (v, max) => `<div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></div></div>`;
    $("goalsBox").innerHTML = `
      <div><div class="goalrow"><b>Aktuální fáze</b><span></span></div><div class="hint">${phase}</div></div>
      <div><div class="goalrow"><b>Návyky 30 dní v řadě</b><span>${Math.min(sk.cur, 30)} / 30</span></div>${bar(sk.cur, 30)}</div>
      <div><div class="goalrow"><b>Návyky 90 dní v řadě</b><span>${Math.min(sk.cur, 90)} / 90</span></div>${bar(sk.cur, 90)}</div>
      <div><div class="goalrow"><b>Půlmaraton pod 1:40</b><span>${hm ? "za " + wksToHm + " týdnů · " + hm.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }) : "—"}</span></div><div class="hint">Tempo 4:44 / km</div></div>`;
  }

  // ---------- HISTORY ----------
  function renderHistory() {
    const keys = Object.keys(state.days).sort().reverse();
    if (!keys.length) { $("histList").innerHTML = '<p class="empty">Zatím nic. První zápis uděláš v záložce Dnes.</p>'; return; }
    $("histList").innerHTML = keys.map(k => {
      const d = state.days[k], h = sleepHours(d.bed, d.wake), p = PLAN[parseKey(k).getDay()];
      const vals = [d.weight != null ? "<b>" + nf1.format(d.weight) + "</b> kg" : null, d.kcal != null ? "<b>" + nf0.format(d.kcal) + "</b> kcal" : null, h != null ? "<b>" + nf1.format(h) + "</b> h" : null].filter(Boolean).join(" · ") || "—";
      const runTxt = d.run ? `<br><small style="color:var(--sage)">🏃 ${esc(d.run.split("\n")[0].slice(0, 60))}</small>` : "";
      const dots = `<i class="tr ${d.training ? "on" : ""}" title="${esc(p.label)}"></i>` + HABITS.map(x => `<i class="${(d.habits || {})[x.k] ? "on" : ""}"></i>`).join("");
      return `<button class="hrow" data-k="${k}"><span class="dt"><b>${fmtShort(k)}</b><small>${DAYS_CS[parseKey(k).getDay()]}</small></span><span class="vals">${vals}${runTxt}</span><span class="dots">${dots}</span></button>`;
    }).join("");
  }

  // ---------- SETTINGS / EXPORT ----------
  function renderSettings() {
    const s = state.settings;
    $("s-startW").value = s.startWeight ?? ""; $("s-startD").value = s.startDate ?? "";
    $("s-targetW").value = s.targetWeight ?? ""; $("s-kcal").value = s.kcalTarget ?? "";
    $("s-sleep").value = s.sleepTarget ?? ""; $("s-hm").value = s.hmDate ?? "";
    renderExport();
  }
  function renderExport() {
    const s = state.settings, n = Number($("exRange").value), tk = todayKey();
    let keys = Object.keys(state.days).sort();
    if (n) keys = keys.filter(k => k > addDays(tk, -n));
    const head = [
      "Ty vs. Ty – export dat (Marek). Rozeber mi trend váhy, kalorie, spánek, tréninky a návyky.",
      `Cíle: váha ${s.targetWeight} kg (start ${s.startWeight ?? "?"} kg), ${s.kcalTarget} kcal/den, spánek ${s.sleepTarget} h, půlmaraton pod 1:40 (${s.hmDate}). Objem: ideálně +0,25–0,5 kg/týden.`,
      "Plán: Po tempo/intervaly, Út nohy, St hrudník+biceps, Čt chill run (volitelně), Pá záda+ramena+triceps, So long run, Ne celý hořejšek.",
      "",
      "datum;den;vaha_kg;kcal;spat;vstal;spanek_h;trenink;splneno;mobil;hygiena;bez_gauce;zapis;trenink_detail;poznamka"
    ];
    const rows = keys.map(k => {
      const d = state.days[k], p = PLAN[parseKey(k).getDay()], h = sleepHours(d.bed, d.wake), hb = d.habits || {};
      return [k, DAYS_SHORT[parseKey(k).getDay()], d.weight ?? "", d.kcal ?? "", d.bed ?? "", d.wake ?? "", h != null ? h.toFixed(1) : "", p.label, d.training ? 1 : 0,
        hb.mobil ? 1 : 0, hb.hygiena ? 1 : 0, hb.gauc ? 1 : 0, hb.zapis ? 1 : 0, (d.run || "").replace(/[;\n]/g, " | "), (d.note || "").replace(/[;\n]/g, " ")].join(";");
    });
    $("exText").value = head.concat(rows).join("\n");
  }
  function bindSettings() {
    $("saveSettings").onclick = () => {
      const s = { startWeight: num($("s-startW").value), startDate: $("s-startD").value || null, targetWeight: num($("s-targetW").value) ?? 95,
        kcalTarget: num($("s-kcal").value) ?? 4000, sleepTarget: num($("s-sleep").value) ?? 7, hmDate: $("s-hm").value || DEFAULT_SETTINGS.hmDate };
      state.settings = s;
      store.saveSettings(s).then(() => { $("setSaved").textContent = "Uloženo ✓"; setTimeout(() => $("setSaved").textContent = "", 1800); })
        .catch(e => { $("setSaved").textContent = "Chyba: " + (e.code || e.message); });
    };
    $("exRange").onchange = renderExport;
    $("copyEx").onclick = () => {
      const t = $("exText");
      const ok = () => { $("copyMsg").textContent = "Zkopírováno ✓ Vlož to do chatu."; };
      if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(ok).catch(() => { t.select(); document.execCommand("copy"); ok(); });
      else { t.select(); document.execCommand("copy"); ok(); }
    };
    $("logoutBtn").onclick = () => store.signOut();
    const names = { dark: "tmavý", light: "světlý" };
    const applyTheme = t => { if (t === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme"); $("themeBtn").textContent = "Motiv: " + names[t]; };
    let th = "dark"; try { th = localStorage.getItem("tvt-theme") === "light" ? "light" : "dark"; } catch (e) {}
    applyTheme(th);
    $("themeBtn").onclick = () => { th = th === "dark" ? "light" : "dark"; try { localStorage.setItem("tvt-theme", th); } catch (e) {} applyTheme(th); };
  }

  // ---------- views ----------
  function show(view) {
    state.view = view;
    ["today", "overview", "history", "settings"].forEach(v => { $("v-" + v).hidden = v !== view; });
    document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "true" : "false"));
    renderCurrent();
    window.scrollTo(0, 0);
  }
  function renderCurrent() {
    if (state.view === "today") renderToday();
    else if (state.view === "overview") renderOverview();
    else if (state.view === "history") renderHistory();
    else renderSettings();
  }

  // ---------- auth ----------
  const AUTH_ERR = {
    "auth/invalid-email": "Neplatný e-mail.", "auth/missing-password": "Zadej heslo.", "auth/weak-password": "Heslo musí mít aspoň 6 znaků.",
    "auth/email-already-in-use": "Účet už existuje, přihlas se.", "auth/invalid-credential": "Špatný e-mail nebo heslo.",
    "auth/wrong-password": "Špatné heslo.", "auth/user-not-found": "Účet neexistuje, vytvoř ho.", "auth/network-request-failed": "Chybí internet.",
    "auth/operation-not-allowed": "Ve Firebase zapni přihlášení E-mail/heslo (Authentication → Sign-in method)."
  };
  function bindAuth() {
    const go = fn => { $("authErr").textContent = ""; fn($("authEmail").value.trim(), $("authPass").value).catch(e => { $("authErr").textContent = AUTH_ERR[e.code] || e.message; }); };
    $("btnLogin").onclick = () => go(store.signIn);
    $("btnSignup").onclick = () => go(store.signUp);
    $("authPass").addEventListener("keydown", e => { if (e.key === "Enter") go(store.signIn); });
  }

  // ---------- boot ----------
  function boot() {
    try { store = DEMO ? makeDemoStore() : makeFirebaseStore(); }
    catch (e) { store = makeDemoStore(); }
    $("mode").textContent = store.label;
    bindToday(); bindSettings(); bindAuth();
    $("tabs").addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) show(b.dataset.view); });
    $("histList").addEventListener("click", e => { const b = e.target.closest(".hrow"); if (b) { state.key = b.dataset.k; state.formKey = null; show("today"); } });

    store.onAuth(user => {
      $("authView").hidden = !!user; $("app").hidden = !user;
      if (!user) return;
      $("acctTxt").textContent = DEMO ? "Demo režim: data jsou uložená jen v tomto prohlížeči. Po vložení Firebase configu se budou synchronizovat." : "Přihlášen: " + user.email;
      $("logoutBtn").hidden = DEMO;
      store.watchSettings(s => { state.settings = { ...DEFAULT_SETTINGS, ...s }; if (state.view !== "settings") renderCurrent(); });
      store.watchDays(days => {
        const editing = state.view === "today" && document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
        const pendingKey = saveTimer ? state.key : null;
        if (pendingKey) days[pendingKey] = state.days[pendingKey];
        state.days = days;
        if (!editing && !pendingKey) state.formKey = null;
        renderCurrent();
      });
      show(state.view);
    });

    // přepnutí dne o půlnoci / návrat do appky
    let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (state.view === "overview") renderOverview(); }, 200); });
    let lastToday = todayKey();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || todayKey() === lastToday) return;
      if (state.key === lastToday) { state.key = todayKey(); state.formKey = null; }
      lastToday = todayKey(); renderCurrent();
    });

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  boot();
})();
