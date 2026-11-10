/* Ty vs. Ty — osobní tracker (Marek). Vanilla JS + Firebase (Auth email/heslo + Firestore). */
(function () {
  "use strict";

  // ---------- plán týdne (0 = neděle) ----------
  const S2 = "1 + 2 do selhání"; // rozcvičková + 2 pracovní do selhání
  const PLAN = {
    1: { type: "run", label: "Tempo / intervaly" },
    2: { type: "gym", label: "Nohy", ex: [
      ["Bulharské dřepy (smith)", "2 do selhání", "bulgar"], ["Rumunský mrtvý tah", S2, "rdl"], ["Leg press", S2],
      ["Zákopy", S2], ["Předkopy", S2], ["Třísla", S2], ["Lýtka", S2]] },
    3: { type: "gym", label: "Hrudník + biceps", ex: [
      ["Smith bench", S2, "bench"], ["Šikmý tlak s jednoručkami", S2], ["Rozpažky na stroji", S2],
      ["Upažování na kladce", S2], ["Bayesian curl", S2], ["Zdvih s lanem na kladce", S2], ["Kladkový crunch v kleku", S2]] },
    4: { type: "run", label: "Chill run", optional: true },
    5: { type: "gym", label: "Záda + ramena + triceps", ex: [
      ["Shyby se závažím / stahování na stroji", S2, "pull"], ["Přítahy úzké kladky vsedě", S2], ["Úzké stahování kladky", S2],
      ["Tlaky na ramena na stroji", S2, "ohp"], ["Zadní ramena na stroji", S2], ["Triceps za hlavou na kladce", S2],
      ["Stahování kladky jednoruč", S2], ["Hyperextenze se závažím", S2]] },
    6: { type: "run", label: "Long run" },
    0: { type: "gym", label: "Celý hořejšek", ex: [
      ["Smith incline bench", S2, "incline"], ["Přítahy vsedě širokým úchopem", S2], ["Upažování na kladce", S2],
      ["Zadní ramena na kladce", S2], ["Triceps za hlavou", S2], ["Bayesian curl", S2]] }
  };
  // hlavní cviky, u kterých se zapisuje váha × opakování
  const LIFTS = { bulgar: "Bulharské dřepy", rdl: "Rumunský mrtvý tah", bench: "Smith bench", pull: "Shyby / stahování", ohp: "Tlaky na ramena", incline: "Smith incline bench" };
  const RUN_DAYS = [1, 4, 6]; // Po, Čt, So
  const PLAN_AHEAD_DAYS = 14; // dopředu jde vložit běh z Gemini až na 14 dní
  const REQUIRED_PER_WEEK = Object.values(PLAN).filter(p => !p.optional).length; // 6
  const HABITS = [
    { k: "mobil", t: "Mobil od 21:00 mimo dosah" },
    { k: "hygiena", t: "Hygiena a pleť" },
    { k: "gauc", t: "Nespal jsem na gauči" },
    { k: "zapis", t: "Zápis do sešitu" },
    { k: "budik", t: "Vstal jsem na 1 budík", since: "2026-11-10" }
  ];
  const habitsFor = k => HABITS.filter(h => !h.since || k >= h.since);
  const DEFAULT_SETTINGS = { startWeight: null, startDate: null, targetWeight: 95, kcalTarget: 4000, sleepTarget: 7, hmDate: "2027-06-30", proteinPerKg: 2 };
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
  const sync = { pending: 0 };
  function renderSync() {
    const el = $("mode"); if (!el) return;
    let t, c;
    if (DEMO) { t = "Demo · data jen v tomto zařízení"; c = "demo"; }
    else if (!navigator.onLine) { t = sync.pending ? "Offline · " + sync.pending + " " + (sync.pending === 1 ? "změna čeká" : "změny čekají") : "Offline · uloží se po připojení"; c = "off"; }
    else if (sync.pending) { t = "Ukládám…"; c = "busy"; }
    else { t = "Synchronizováno"; c = "ok"; }
    el.textContent = t; el.className = "mode " + c;
  }
  function trackSave(promise) {
    sync.pending++; renderSync();
    return Promise.resolve(promise).finally(() => { sync.pending = Math.max(0, sync.pending - 1); renderSync(); });
  }
  function showSave(t) {
    const el = $("saveState"); el.textContent = t; el.style.opacity = 1;
    clearTimeout(saveMsgTimer); saveMsgTimer = setTimeout(() => { el.style.opacity = 0; }, 1800);
  }
  function currentDay() { return state.days[state.key] || {}; }
  function patchDay(patch, immediate, key) {
    const k = key || state.key, isCur = k === state.key;
    const d = { ...(state.days[k] || {}), ...patch, date: k, updatedAt: Date.now() };
    if (patch.habits) d.habits = { ...((state.days[k] || {}).habits || {}), ...patch.habits };
    if (patch.lifts) d.lifts = { ...((state.days[k] || {}).lifts || {}), ...patch.lifts };
    state.days[k] = d;
    const run = () => {
      if (isCur) saveTimer = null;
      if (!navigator.onLine && !DEMO) showSave("Offline · uloží se po připojení");
      trackSave(store.saveDay(k, state.days[k])).then(() => showSave("Uloženo ✓")).catch(e => showSave("Neuloženo: " + (e.code || e.message)));
    };
    if (isCur) clearTimeout(saveTimer);
    if (immediate || !isCur) run(); else saveTimer = setTimeout(run, 600);
    if (isCur) renderTodayDerived();
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
    $("f-prot").value = d.protein ?? "";
    $("f-note").value = d.note ?? "";
    $("f-run").value = d.run ?? "";
    state.formKey = state.key; state.exKey = null;
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
    if (p.type === "gym") renderExList(k, p);
    $("habitBox").innerHTML = habitsFor(k).map(h => chkHtml("h-" + h.k, h.t, "", !!(d.habits || {})[h.k])).join("");
    renderEnergy(d);
    renderBanners();
    if (food.dayKey !== k) closePending();
    renderMeals();
    renderTodayDerived();
  }

  function renderTodayDerived() {
    const d = currentDay(), s = state.settings;
    const h = sleepHours(d.bed, d.wake);
    $("sleepHint").textContent = h != null ? "Spánek: " + fmtH(h) + (h < s.sleepTarget ? " · pod cílem " + s.sleepTarget + " h" : " ✓") : "";
    renderMacros(d);
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
    numField("f-weight", "weight"); numField("f-kcal", "kcal"); numField("f-prot", "protein");
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
    $("energyBox").addEventListener("click", e => {
      const b = e.target.closest("button[data-e]"); if (!b) return;
      const n = Number(b.dataset.e); patchDay({ energy: currentDay().energy === n ? null : n }, true); renderEnergy(currentDay());
    });
  }


  // ---------- cviky + váhy hlavních cviků ----------
  function lastLift(id, beforeK) {
    const ks = Object.keys(state.days).filter(k => k < beforeK && state.days[k].lifts && state.days[k].lifts[id] && state.days[k].lifts[id].w != null).sort();
    if (!ks.length) return null;
    const k = ks[ks.length - 1]; return { k, ...state.days[k].lifts[id] };
  }
  const fmtLift = l => l ? nf1.format(l.w).replace(/,0$/, "") + " kg" + (l.r ? " × " + l.r : "") : "";
  function renderExList(k, p) {
    const box = $("exList");
    if (state.exKey === k && box.contains(document.activeElement)) return; // nepřepisuj během psaní
    state.exKey = k;
    const lifts = (state.days[k] || {}).lifts || {};
    box.innerHTML = `<li class="exnote">Do selhání · cíl min. 6–8 opakování</li>` + p.ex.map((e, i) => {
      const id = e[2];
      let lift = "";
      if (id) {
        const cur = lifts[id] || {}, prev = lastLift(id, k);
        lift = `<div class="lift" data-lift="${id}">
          <div class="unit"><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" value="${cur.w ?? ""}" data-f="w" aria-label="Váha ${esc(e[0])}"><span>kg</span></div>
          <span class="x">×</span>
          <div class="unit"><input type="number" inputmode="numeric" step="1" min="0" placeholder="opak." value="${cur.r ?? ""}" data-f="r" aria-label="Opakování ${esc(e[0])}"></div>
          <small>${prev ? "minule " + fmtLift(prev) : "nejlepší série"}</small></div>`;
      }
      return `<li class="${id ? "haslift" : ""}"><i>${i + 1}</i><span>${esc(e[0])}</span><b>${esc(e[1])}</b>${lift}</li>`;
    }).join("");
  }
  function bindLifts() {
    $("exList").addEventListener("input", e => {
      const inp = e.target.closest("input[data-f]"); if (!inp) return;
      const id = inp.closest(".lift").dataset.lift, cur = { ...(((currentDay().lifts) || {})[id] || {}) };
      cur[inp.dataset.f] = num(inp.value);
      patchDay({ lifts: { [id]: cur } });
    });
  }

  // ---------- energie 1–5 ----------
  const ENERGY = ["", "Vyčerpaný", "Unavený", "OK", "Dobrý", "Nabitý"];
  function renderEnergy(d) {
    const v = d.energy || 0;
    $("energyBox").innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" class="en${v === n ? " on" : ""}" data-e="${n}" aria-pressed="${v === n}" title="${ENERGY[n]}">${n}</button>`).join("");
    $("energyTxt").textContent = v ? ENERGY[v] : "Jak se dnes cítíš?";
  }

  // ---------- běhy na týden ----------
  // celé názvy dnů stačí samy, zkratky (Po, Čt…) jen s oddělovačem („Po:“, „Po –“, „Po 10. 11.“), ať „Po rozklusu…“ není pondělí
  const DAY_RE = /^[\s*#>\-•_]*(?:\*\*|__)?\s*(?:(pondělí|pondeli|úterý|utery|středa|streda|čtvrtek|ctvrtek|pátek|patek|sobota|neděle|nedele)(?![\p{L}])|(po|út|ut|st|čt|ct|pá|pa|so|ne)(?=\s*(?:[:\-–—).]|$|\d{1,2}\.\s*\d{1,2}\.)))/iu;
  const DAY_NUM = { po: 1, pondělí: 1, pondeli: 1, út: 2, ut: 2, úterý: 2, utery: 2, st: 3, středa: 3, streda: 3, čt: 4, ct: 4, čtvrtek: 4, ctvrtek: 4, pá: 5, pa: 5, pátek: 5, patek: 5, so: 6, sobota: 6, ne: 0, neděle: 0, nedele: 0 };
  function parseWeekPlan(text) {
    const out = {}; let cur = null;
    String(text).split(/\r?\n/).forEach(line => {
      const m = line.match(DAY_RE);
      if (m) {
        cur = DAY_NUM[(m[1] || m[2]).toLowerCase()];
        const rest = line.slice(m[0].length).replace(/^[\s.]*(\(?\d{1,2}\.\s*\d{1,2}\.(\s*\d{2,4})?\)?)?[\s*_:\-–—).]*/, "").replace(/\*\*/g, "").trim();
        out[cur] = out[cur] || []; if (rest) out[cur].push(rest);
      }
      else if (cur != null && line.trim()) out[cur].push(line.trim().replace(/\*\*/g, ""));
    });
    const res = {}; Object.keys(out).forEach(k => { const t = out[k].join("\n").trim(); if (t) res[k] = t; });
    return res;
  }
  const weekOf = k => mondayOf(k);
  const runKeys = mon => RUN_DAYS.map(wd => addDays(mon, (wd + 6) % 7));
  function weekHasRuns(mon) { return runKeys(mon).some(k => (state.days[k] || {}).run); }
  function openWeekBox(mon) {
    state.weekMon = mon || weekOf(state.key);
    const [a, b] = [state.weekMon, addDays(state.weekMon, 6)];
    $("wbTitle").textContent = "Běhy na týden " + fmtShort(a) + " – " + fmtShort(b);
    $("wbText").value = ""; $("wbPreview").hidden = true; $("wbStep1").hidden = false; $("wbMsg").textContent = "";
    $("weekBox").hidden = false; $("runBanner").hidden = true; $("weekBox").scrollIntoView({ behavior: "smooth", block: "start" }); $("wbText").focus();
  }
  function renderBanners() {
    const tk = todayKey(), mon = weekOf(state.key), d = parseKey(tk);
    const showRun = state.view === "today" && addDays(mon, 6) >= tk && !weekHasRuns(mon) && $("weekBox").hidden;
    $("runBanner").hidden = !showRun;
    if (showRun) $("runBannerTxt").textContent = mon === weekOf(tk) ? "Vlož běhy na tento týden" : "Vlož běhy na týden " + fmtShort(mon) + " – " + fmtShort(addDays(mon, 6));
    $("sumBanner").hidden = !(state.key === tk && d.getDay() === 0 && new Date().getHours() >= 17);
  }
  function bindWeekBox() {
    $("runBannerBtn").onclick = () => openWeekBox(weekOf(state.key));
    $("weekLink").onclick = () => openWeekBox(weekOf(state.key));
    $("wbCancel").onclick = $("wbCancel2").onclick = () => { $("weekBox").hidden = true; renderBanners(); };
    $("wbSplit").onclick = () => {
      const t = $("wbText").value.trim(); if (!t) { $("wbText").focus(); return; }
      const parsed = parseWeekPlan(t);
      const keys = runKeys(state.weekMon);
      const found = RUN_DAYS.filter(wd => parsed[wd]).length;
      RUN_DAYS.forEach((wd, i) => {
        $("wb-" + wd).value = parsed[wd] || ((state.days[keys[i]] || {}).run || "");
        $("wbl-" + wd).textContent = DAYS_CS[wd][0].toUpperCase() + DAYS_CS[wd].slice(1) + " " + fmtShort(keys[i]) + " · " + PLAN[wd].label;
      });
      const other = Object.keys(parsed).map(Number).filter(wd => !RUN_DAYS.includes(wd));
      $("wbMsg").textContent = !found && !other.length ? "Nenašel jsem dny (Po/Čt/So). Celý text jsem dal k pondělí – rozděl ho prosím ručně."
        : other.length ? "Pozor: plán obsahuje i jiné dny (" + other.map(w => DAYS_SHORT[w]).join(", ") + "). Ty se neuloží – případně je přesuň do polí." : "Zkontroluj rozdělení a ulož.";
      if (!found && !other.length) $("wb-1").value = t;
      $("wbStep1").hidden = true; $("wbPreview").hidden = false;
    };
    $("wbSave").onclick = () => {
      const keys = runKeys(state.weekMon);
      RUN_DAYS.forEach((wd, i) => { const v = $("wb-" + wd).value.trim(); patchDay({ run: v || null }, true, keys[i]); });
      $("weekBox").hidden = true; state.formKey = null; renderToday(); showSave("Běhy na týden uloženy ✓");
    };
    $("sumBannerBtn").onclick = () => { state.sumWeek = weekOf(todayKey()); show("overview"); setTimeout(() => $("sumCard").scrollIntoView({ behavior: "smooth" }), 50); };
  }

  // ---------- JÍDLO (foto / text → AI odhad → seznam jídel) ----------
  const food = { pending: null, img: null, text: "", src: "", editId: null, busy: false, dayKey: null, delArm: null };
  const mealsOf = d => Array.isArray(d.meals) ? d.meals : [];
  const sumMeals = ms => ms.reduce((a, m) => ({ kcal: a.kcal + (+m.kcal || 0), protein: a.protein + (+m.protein || 0), carbs: a.carbs + (+m.carbs || 0), fat: a.fat + (+m.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  function proteinTarget() {
    const s = state.settings, w = avg7(todayKey()) ?? lastWeight() ?? s.startWeight;
    return w ? Math.round(w * (s.proteinPerKg || 2)) : null;
  }
  function renderMacros(d) {
    const s = state.settings, pt = proteinTarget();
    const kc = d.kcal ?? null, pr = d.protein ?? null;
    const pct = (v, t) => t ? Math.min(100, (v || 0) / t * 100).toFixed(1) : 0;
    $("mKcal").textContent = kc != null ? nf0.format(kc) : "0";
    $("mKcalT").textContent = "/ " + nf0.format(s.kcalTarget) + " kcal";
    $("mKcalBar").style.width = pct(kc, s.kcalTarget) + "%";
    $("mProt").textContent = pr != null ? nf0.format(pr) : "0";
    $("mProtT").textContent = pt ? "/ " + pt + " g" : "/ ? g (zapiš váhu)";
    $("mProtBar").style.width = pct(pr, pt) + "%";
    const left = s.kcalTarget - (kc || 0);
    $("kcalHint").textContent = kc == null ? "" : left > 0 ? "Chybí " + nf0.format(left) + " kcal" + (pt && pr != null && pt > pr ? " a " + nf0.format(pt - pr) + " g bílkovin" : "") : "Kalorický cíl splněn ✓";
  }
  function renderMeals() {
    const ms = mealsOf(currentDay());
    $("mealList").innerHTML = ms.length ? ms.map(m => `
      <li class="meal" data-id="${m.id}">
        <button type="button" class="meal-main" data-act="edit"><span class="meal-t">${esc(m.t || "")}</span><span class="meal-n">${esc(m.name || "Jídlo")}</span>
        <span class="meal-v"><b>${nf0.format(m.kcal || 0)}</b> kcal · <b>${nf0.format(m.protein || 0)}</b> g B</span></button>
        <button type="button" class="meal-del${food.delArm === m.id ? " armed" : ""}" data-act="del" aria-label="Smazat jídlo">${food.delArm === m.id ? "Smazat?" : "×"}</button>
      </li>`).join("") : `<li class="empty">Zatím žádné jídlo. Vyfoť talíř nebo ho popiš.</li>`;
  }
  function setMeals(ms) {
    const t = sumMeals(ms), d = currentDay();
    const kcal = ms.length ? Math.round(t.kcal) : null, protein = ms.length ? Math.round(t.protein) : null;
    patchDay({ meals: ms, kcal, protein, carbs: ms.length ? Math.round(t.carbs) : null, fat: ms.length ? Math.round(t.fat) : null }, true);
    $("f-kcal").value = kcal ?? ""; $("f-prot").value = protein ?? "";
    renderMeals(); renderMacros(currentDay());
  }
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };

  function openPending(src, values) {
    food.dayKey = state.key; food.src = src;
    const v = values || { name: "", kcal: "", protein: "", carbs: "", fat: "", items: [], note: "" };
    food.pending = v;
    $("aiBox").hidden = false;
    $("aiImg").hidden = !food.img; if (food.img) $("aiImg").src = food.img.preview;
    $("p-name").value = v.name ?? ""; $("p-kcal").value = v.kcal ?? ""; $("p-prot").value = v.protein ?? "";
    $("p-carbs").value = v.carbs ?? ""; $("p-fat").value = v.fat ?? "";
    $("aiItems").innerHTML = (v.items || []).map(i => `<span>${esc(i.name)}${i.grams ? " " + i.grams + " g" : ""} · ${i.kcal} kcal</span>`).join("");
    $("aiNote").textContent = v.note ? (v.confidence ? "Jistota: " + v.confidence + ". " : "") + v.note : "";
    $("aiHintRow").hidden = src === "ručně";
    $("aiAdd").textContent = food.editId ? "Uložit změny" : "Přidat jídlo";
    $("aiBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function closePending() {
    food.pending = null; food.img = null; food.text = ""; food.editId = null; food.busy = false;
    $("aiBox").hidden = true; $("textBox").hidden = true; $("ai-hint").value = ""; $("aiStatus").textContent = "";
    $("aiImg").removeAttribute("src");
  }
  function aiErrorText(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (/app.?check|attestation|unauthenticated|401/i.test(m)) return "AI zatím blokuje ochrana App Check (nastavení ještě není hotové). Zadej hodnoty ručně.";
    if (/quota|429|resource.?exhausted|rate/i.test(m)) return "Dnešní limit AI je vyčerpaný. Zadej hodnoty ručně, zítra to pojede.";
    if (/network|failed to fetch|offline/i.test(m) || !navigator.onLine) return "Chybí internet. Odhad z fotky potřebuje připojení, hodnoty můžeš zadat ručně.";
    if (/JSON|Unexpected token/i.test(m)) return "AI vrátila nečitelnou odpověď. Zkus to znovu.";
    return "Odhad se nepovedl: " + m.slice(0, 140);
  }
  async function runEstimate() {
    if (food.busy) return;
    const ai = DEMO ? demoAI : window.TVT_AI;
    if (!ai) { $("aiStatus").textContent = "AI se ještě načítá – zkus to za pár sekund."; return; }
    food.busy = true; $("aiStatus").innerHTML = '<span class="spin"></span> Odhaduji…'; $("aiRedo").disabled = $("aiAdd").disabled = true;
    try {
      const r = await ai.estimate({ image: food.img ? { data: food.img.data, mime: food.img.mime } : null, text: food.text, hint: $("ai-hint").value.trim() });
      if (!food.pending) return;
      openPending(food.src, r);
      $("aiStatus").textContent = r.items && r.items.length ? "Odhad hotový – zkontroluj a případně uprav." : "Jídlo jsem nepoznal – doplň hodnoty ručně.";
    } catch (e) {
      $("aiStatus").textContent = aiErrorText(e);
    } finally {
      food.busy = false; $("aiRedo").disabled = $("aiAdd").disabled = false;
    }
  }
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 1024, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/jpeg", 0.82);
      return { data: dataUrl.split(",")[1], mime: "image/jpeg", preview: dataUrl };
    } finally { URL.revokeObjectURL(url); }
  }
  // demo odhad (jen bez Firebase – kvůli zkoušení vzhledu)
  const demoAI = { estimate: () => new Promise(r => setTimeout(() => r({ name: "Kuře s rýží (demo)", items: [{ name: "rýže", grams: 200, kcal: 260, protein: 5, carbs: 57, fat: 1 }, { name: "kuřecí prsa", grams: 150, kcal: 250, protein: 46, carbs: 0, fat: 6 }, { name: "olej", grams: 10, kcal: 90, protein: 0, carbs: 0, fat: 10 }], kcal: 600, protein: 51, carbs: 57, fat: 17, confidence: "střední", note: "Demo odhad – v appce s Firebase odhaduje Gemini." }), 700)) };

  function bindFood() {
    const onPhoto = async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = "";
      if (!f) return;
      closePending();
      try { food.img = await compressImage(f); } catch (err) { $("aiStatus").textContent = "Fotku se nepodařilo načíst."; return; }
      openPending("foto"); runEstimate();
    };
    $("f-photo").addEventListener("change", onPhoto);
    $("f-gallery").addEventListener("change", onPhoto);
    $("btnText").onclick = () => { closePending(); $("textBox").hidden = false; $("f-foodText").focus(); };
    $("btnTextGo").onclick = () => {
      const t = $("f-foodText").value.trim(); if (!t) { $("f-foodText").focus(); return; }
      food.text = t; $("textBox").hidden = true; $("f-foodText").value = ""; openPending("text"); runEstimate();
    };
    $("btnManual").onclick = () => { closePending(); openPending("ručně"); $("p-name").focus(); };
    $("aiRedo").onclick = runEstimate;
    $("aiCancel").onclick = closePending;
    $("aiAdd").onclick = () => {
      const kcal = num($("p-kcal").value);
      if (kcal == null) { $("aiStatus").textContent = "Doplň aspoň kalorie."; $("p-kcal").focus(); return; }
      const meal = { id: food.editId || Date.now().toString(36), t: nowHM(), name: $("p-name").value.trim() || "Jídlo",
        kcal: Math.round(kcal), protein: Math.round(num($("p-prot").value) || 0), carbs: Math.round(num($("p-carbs").value) || 0), fat: Math.round(num($("p-fat").value) || 0), src: food.src };
      let ms = mealsOf(currentDay()).slice();
      if (food.editId) { const old = ms.find(m => m.id === food.editId); if (old) meal.t = old.t; ms = ms.map(m => m.id === food.editId ? meal : m); }
      else ms.push(meal);
      closePending(); setMeals(ms); showSave("Jídlo uloženo ✓");
    };
    $("mealList").addEventListener("click", e => {
      const btn = e.target.closest("button[data-act]"); if (!btn) return;
      const id = btn.closest(".meal").dataset.id, ms = mealsOf(currentDay());
      if (btn.dataset.act === "del") {
        if (food.delArm === id) { food.delArm = null; setMeals(ms.filter(m => m.id !== id)); }
        else { food.delArm = id; renderMeals(); setTimeout(() => { if (food.delArm === id) { food.delArm = null; renderMeals(); } }, 3000); }
      } else {
        const m = ms.find(x => x.id === id); if (!m) return;
        closePending(); food.editId = id; openPending(m.src === "ručně" ? "ručně" : "text", { ...m, items: [], note: "" });
        $("aiHintRow").hidden = true;
      }
    });
  }

  // ---------- stats ----------
  function weightsBetween(fromK, toK) {
    const out = [];
    for (let k = fromK; k <= toK; k = addDays(k, 1)) { const w = (state.days[k] || {}).weight; if (w != null) out.push(w); }
    return out;
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function avg7(endK) { const w = weightsBetween(addDays(endK, -6), endK); return w.length >= 2 ? avg(w) : (w.length ? w[0] : null); }
  function allHabits(d, k) { return d && d.habits && habitsFor(k).every(h => d.habits[h.k]); }
  function streaks(upTo) {
    const tk = upTo || todayKey();
    let k = allHabits(state.days[tk], tk) ? tk : addDays(tk, -1), cur = 0;
    while (allHabits(state.days[k], k)) { cur++; k = addDays(k, -1); }
    let best = 0, run = 0;
    const keys = Object.keys(state.days).sort();
    if (keys.length) for (let k2 = keys[0]; k2 <= tk; k2 = addDays(k2, 1)) { if (allHabits(state.days[k2], k2)) { run++; best = Math.max(best, run); } else run = 0; }
    return { cur, best };
  }
  function rateAt(k) {
    const a = weightsBetween(addDays(k, -6), k), b = weightsBetween(addDays(k, -13), addDays(k, -7));
    return a.length >= 2 && b.length >= 2 ? avg(a) - avg(b) : null;
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
    renderKcalSuggest();
    renderSummary();

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
      const hs = habitsFor(k);
      if (k <= tk) { hTotal += hs.length; hDone += hs.filter(h => (d.habits || {})[h.k]).length; }
      const parts = hs.filter(h => (d.habits || {})[h.k]).length + (p.optional ? 0 : (d.training ? 1 : 0));
      const max = hs.length + (p.optional ? 0 : 1);
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
    const pt = proteinTarget() || 160;
    $("pChart").innerHTML = barChart(last14.map(k => ({ k, v: (state.days[k] || {}).protein ?? null })), pt, v => nf0.format(v), "g", $("pChart").clientWidth);
    const k7 = [], p7 = []; for (let i = 0; i < 7; i++) { const d = state.days[addDays(tk, -i)] || {}; if (d.kcal != null) k7.push(d.kcal); if (d.protein != null) p7.push(d.protein); }
    $("kAvg").textContent = k7.length ? "Ø 7 dní: " + nf0.format(avg(k7)) + " kcal (cíl " + nf0.format(s.kcalTarget) + ")" : "";
    $("pAvg").textContent = p7.length ? "Ø 7 dní: " + nf0.format(avg(p7)) + " g (cíl " + pt + " g = " + nf1.format(s.proteinPerKg || 2) + " g/kg)" : "Cíl " + pt + " g = " + nf1.format(s.proteinPerKg || 2) + " g/kg";
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

  // ---------- automatická úprava kalorického cíle ----------
  function kcalSuggestion() {
    const s = state.settings, tk = todayKey();
    const r1 = rateAt(tk), r2 = rateAt(addDays(tk, -7));
    if (r1 == null || r2 == null) return null;
    if (s.kcalChangedAt && s.kcalChangedAt > addDays(tk, -14)) return null; // po změně nech 2 týdny působit
    if (s.kcalDismissWeek === mondayOf(tk)) return null;
    const a = Math.round(r1 * 100) / 100, b = Math.round(r2 * 100) / 100;
    if (a < 0.25 && b < 0.25) return { delta: 200, why: "2 týdny pod 0,25 kg/týden (" + nf1.format(b) + " a " + nf1.format(a) + " kg)" };
    if (a > 0.5 && b > 0.5) return { delta: -200, why: "2 týdny nad 0,5 kg/týden (" + nf1.format(b) + " a " + nf1.format(a) + " kg)" };
    return null;
  }
  function renderKcalSuggest() {
    const sg = kcalSuggestion(), box = $("kcalSuggest");
    if (!sg) { box.hidden = true; return; }
    const nt = state.settings.kcalTarget + sg.delta;
    box.hidden = false;
    $("ksTxt").textContent = (sg.delta > 0 ? "Přibíráš pomalu: " : "Přibíráš moc rychle: ") + sg.why + ".";
    $("ksApply").textContent = (sg.delta > 0 ? "Zvýšit" : "Snížit") + " cíl na " + nf0.format(nt) + " kcal";
    $("ksApply").onclick = () => saveSettingsPatch({ kcalTarget: nt, kcalChangedAt: todayKey() }, "Cíl kalorií změněn na " + nf0.format(nt) + " ✓");
    $("ksLater").onclick = () => saveSettingsPatch({ kcalDismissWeek: mondayOf(todayKey()) });
  }
  function saveSettingsPatch(patch, msg) {
    state.settings = { ...state.settings, ...patch };
    trackSave(store.saveSettings(state.settings)).then(() => { if (msg) showSave(msg); }).catch(e => showSave("Chyba: " + (e.code || e.message)));
    renderCurrent();
  }

  // ---------- týdenní souhrn ----------
  function weekStats(mon) {
    const tk = todayKey(), s = state.settings, end = addDays(mon, 6);
    const ks = []; for (let i = 0; i < 7; i++) ks.push(addDays(mon, i));
    const ds = ks.map(k => state.days[k] || {});
    const vals = f => ds.map(f).filter(v => v != null);
    const w = vals(d => d.weight), kc = vals(d => d.kcal), pr = vals(d => d.protein), en = vals(d => d.energy);
    const sl = ds.map(d => sleepHours(d.bed, d.wake)).filter(v => v != null);
    let done = 0, bonus = 0, hDone = 0, hTot = 0; const per = {};
    ks.forEach((k, i) => {
      const d = ds[i], p = PLAN[parseKey(k).getDay()];
      if (d.training) { if (p.optional) bonus++; else done++; }
      if (k <= tk) habitsFor(k).forEach(h => { hTot++; const on = !!(d.habits || {})[h.k]; if (on) hDone++; if (k < tk || on) { per[h.k] = per[h.k] || { t: h.t, n: 0, of: 0 }; per[h.k].of++; if (on) per[h.k].n++; } });
    });
    const prevW = weightsBetween(addDays(mon, -7), addDays(mon, -1));
    const pt = proteinTarget();
    const lifts = Object.keys(LIFTS).map(id => {
      const best = ks.map(k => ((state.days[k] || {}).lifts || {})[id]).filter(l => l && l.w != null).sort((a, b) => (b.w * (1 + (b.r || 1) / 30)) - (a.w * (1 + (a.r || 1) / 30)))[0];
      if (!best) return null;
      const prev = lastLift(id, mon);
      return { id, name: LIFTS[id], best, prev };
    }).filter(Boolean);
    return { mon, end, w: avg(w), wN: w.length, wPrev: avg(prevW), kc: avg(kc), kcN: kc.length, kcHit: kc.filter(v => v >= s.kcalTarget).length,
      pr: avg(pr), prN: pr.length, prHit: pt ? pr.filter(v => v >= pt).length : 0, pt, sl: avg(sl), slLow: sl.filter(v => v < s.sleepTarget).length, slN: sl.length,
      en: avg(en), done, bonus, habPct: hTot ? Math.round(hDone / hTot * 100) : null, per, lifts, streak: streaks(end < tk ? end : tk) };
  }
  function summaryInsights(st) {
    const out = [], s = state.settings;
    if (st.w != null && st.wPrev != null && st.wN >= 3) {
      const ch = st.w - st.wPrev;
      out.push(ch < 0.25 ? "Váha +" + nf1.format(ch) + " kg – pod tempem. Přidej jídlo, hlavně večer." : ch <= 0.5 ? "Váha +" + nf1.format(ch) + " kg – ideální tempo, drž to." : "Váha +" + nf1.format(ch) + " kg – moc rychle, uber ~200 kcal.");
    }
    if (st.kcN) out.push("Kalorický cíl splněn " + st.kcHit + " z " + st.kcN + " zapsaných dní.");
    if (st.pt && st.prN && st.prHit < st.prN) out.push("Bílkoviny pod cílem " + (st.prN - st.prHit) + "× z " + st.prN + " dní.");
    if (st.slLow) out.push("Spánek pod " + nf1.format(s.sleepTarget) + " h: " + st.slLow + "×.");
    const weak = Object.values(st.per).filter(h => h.of).sort((a, b) => a.n / a.of - b.n / b.of)[0];
    if (weak && weak.n < weak.of) out.push("Nejslabší návyk: " + weak.t + " (" + weak.n + "/" + weak.of + ").");
    return out.slice(0, 4);
  }
  function renderSummary() {
    const tk = todayKey();
    const mon = state.sumWeek || weekOf(tk), st = weekStats(mon);
    $("sumTitle").textContent = fmtShort(mon) + " – " + fmtShort(st.end);
    $("sumLabel").textContent = mon === weekOf(tk) ? "Týdenní souhrn · tento týden" : mon === addDays(weekOf(tk), -7) ? "Týdenní souhrn · minulý týden" : "Týdenní souhrn";
    $("sumNext").disabled = mon >= weekOf(tk);
    const kpi = (l, v, sub) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub || ""}</div></div>`;
    const dash = "—";
    const wCh = st.w != null && st.wPrev != null ? (st.w - st.wPrev >= 0 ? "+" : "") + nf1.format(st.w - st.wPrev) + " kg vs. minulý týden" : st.wN + "× vážení";
    $("sumKpis").innerHTML =
      kpi("Váha Ø", st.w != null ? nf1.format(st.w) + "<small>kg</small>" : dash, wCh) +
      kpi("Kalorie Ø", st.kc != null ? nf0.format(st.kc) + "<small>kcal</small>" : dash, st.kcN ? "cíl splněn " + st.kcHit + "/" + st.kcN : "") +
      kpi("Bílkoviny Ø", st.pr != null ? nf0.format(st.pr) + "<small>g</small>" : dash, st.pt ? "cíl " + st.pt + " g" : "") +
      kpi("Spánek Ø", st.sl != null ? nf1.format(st.sl) + "<small>h</small>" : dash, st.slN ? "pod cílem " + st.slLow + "×" : "") +
      kpi("Tréninky", st.done + "<small>/ " + REQUIRED_PER_WEEK + "</small>", st.bonus ? "+ chill run" : "4 gym + 2 běhy") +
      kpi("Návyky", st.habPct != null ? st.habPct + "<small>%</small>" : dash, "série " + st.streak.cur + " dní") +
      kpi("Energie Ø", st.en != null ? nf1.format(st.en) + "<small>/ 5</small>" : dash, "") +
      kpi("Rekord série", st.streak.best + "<small>dní</small>", "cíl 30");
    $("sumLifts").innerHTML = st.lifts.length ? st.lifts.map(l => {
      const e = x => x.w * (1 + (x.r || 1) / 30), diff = l.prev ? e(l.best) - e(l.prev) : null;
      const tag = diff == null ? "" : diff > 0.5 ? `<span class="up">▲ silnější</span>` : diff < -0.5 ? `<span class="down">▼ slabší</span>` : `<span class="eq">= stejně</span>`;
      return `<li><span>${esc(l.name)}</span><b>${fmtLift(l.best)}</b>${tag}</li>`;
    }).join("") : `<li class="empty">Tento týden bez zapsaných vah na hlavních cvicích.</li>`;
    const ins = summaryInsights(st);
    $("sumIns").innerHTML = ins.length ? ins.map(t => `<li>${esc(t)}</li>`).join("") : `<li class="empty">Málo dat na hodnocení – zapisuj a v neděli tu bude souhrn.</li>`;
  }

  // ---------- HISTORY ----------
  function renderHistory() {
    const keys = Object.keys(state.days).sort().reverse();
    if (!keys.length) { $("histList").innerHTML = '<p class="empty">Zatím nic. První zápis uděláš v záložce Dnes.</p>'; return; }
    $("histList").innerHTML = keys.map(k => {
      const d = state.days[k], h = sleepHours(d.bed, d.wake), p = PLAN[parseKey(k).getDay()];
      const vals = [d.weight != null ? "<b>" + nf1.format(d.weight) + "</b> kg" : null, d.kcal != null ? "<b>" + nf0.format(d.kcal) + "</b> kcal" : null, d.protein != null ? "<b>" + nf0.format(d.protein) + "</b> g B" : null, h != null ? "<b>" + nf1.format(h) + "</b> h" : null].filter(Boolean).join(" · ") || "—";
      const runTxt = d.run ? `<br><small style="color:var(--sage)">🏃 ${esc(d.run.split("\n")[0].slice(0, 60))}</small>` : "";
      const dots = `<i class="tr ${d.training ? "on" : ""}" title="${esc(p.label)}"></i>` + habitsFor(k).map(x => `<i class="${(d.habits || {})[x.k] ? "on" : ""}"></i>`).join("") + (d.energy ? `<em class="hen">⚡${d.energy}</em>` : "");
      return `<button class="hrow" data-k="${k}"><span class="dt"><b>${fmtShort(k)}</b><small>${DAYS_CS[parseKey(k).getDay()]}</small></span><span class="vals">${vals}${runTxt}</span><span class="dots">${dots}</span></button>`;
    }).join("");
  }

  // ---------- SETTINGS / EXPORT ----------
  function renderSettings() {
    const s = state.settings;
    $("s-startW").value = s.startWeight ?? ""; $("s-startD").value = s.startDate ?? "";
    $("s-targetW").value = s.targetWeight ?? ""; $("s-kcal").value = s.kcalTarget ?? "";
    $("s-sleep").value = s.sleepTarget ?? ""; $("s-hm").value = s.hmDate ?? ""; $("s-protkg").value = s.proteinPerKg ?? 2;
    renderExport();
  }
  function renderExport() {
    const s = state.settings, n = Number($("exRange").value), tk = todayKey();
    let keys = Object.keys(state.days).sort();
    if (n) keys = keys.filter(k => k > addDays(tk, -n));
    const head = [
      "Ty vs. Ty – export dat (Marek). Rozeber mi trend váhy, kalorie, spánek, tréninky a návyky.",
      `Cíle: váha ${s.targetWeight} kg (start ${s.startWeight ?? "?"} kg), ${s.kcalTarget} kcal/den, bílkoviny ${s.proteinPerKg || 2} g/kg, spánek ${s.sleepTarget} h, půlmaraton pod 1:40 (${s.hmDate}). Objem: ideálně +0,25–0,5 kg/týden.`,
      "Plán: Po tempo/intervaly, Út nohy, St hrudník+biceps, Čt chill run (volitelně), Pá záda+ramena+triceps, So long run, Ne celý hořejšek.",
      "",
      "datum;den;vaha_kg;kcal;bilkoviny_g;sacharidy_g;tuky_g;spat;vstal;spanek_h;energie_1_5;trenink;splneno;mobil;hygiena;bez_gauce;zapis;budik;hlavni_cviky;trenink_detail;jidla;poznamka"
    ];
    const rows = keys.map(k => {
      const d = state.days[k], p = PLAN[parseKey(k).getDay()], h = sleepHours(d.bed, d.wake), hb = d.habits || {};
      return [k, DAYS_SHORT[parseKey(k).getDay()], d.weight ?? "", d.kcal ?? "", d.protein ?? "", d.carbs ?? "", d.fat ?? "", d.bed ?? "", d.wake ?? "", h != null ? h.toFixed(1) : "", d.energy ?? "", p.label, d.training ? 1 : 0,
        hb.mobil ? 1 : 0, hb.hygiena ? 1 : 0, hb.gauc ? 1 : 0, hb.zapis ? 1 : 0, k >= "2026-11-10" ? (hb.budik ? 1 : 0) : "",
        Object.keys(d.lifts || {}).filter(id => d.lifts[id] && d.lifts[id].w != null).map(id => LIFTS[id] + " " + fmtLift(d.lifts[id])).join(" | "), (d.run || "").replace(/[;\n]/g, " | "), mealsOf(d).map(m => `${m.t} ${m.name} ${m.kcal}kcal/${m.protein}gB`).join(" | ").replace(/;/g, ","), (d.note || "").replace(/[;\n]/g, " ")].join(";");
    });
    $("exText").value = head.concat(rows).join("\n");
  }
  function bindSettings() {
    $("saveSettings").onclick = () => {
      const s = { startWeight: num($("s-startW").value), startDate: $("s-startD").value || null, targetWeight: num($("s-targetW").value) ?? 95,
        kcalTarget: num($("s-kcal").value) ?? 4000, sleepTarget: num($("s-sleep").value) ?? 7, hmDate: $("s-hm").value || DEFAULT_SETTINGS.hmDate, proteinPerKg: num($("s-protkg").value) ?? 2 };
      state.settings = { ...state.settings, ...s }; const sAll = state.settings;
      trackSave(store.saveSettings(sAll)).then(() => { $("setSaved").textContent = "Uloženo ✓"; setTimeout(() => $("setSaved").textContent = "", 1800); })
        .catch(e => { $("setSaved").textContent = "Chyba: " + (e.code || e.message); });
    };
    $("exRange").onchange = renderExport;
    $("pdfBtn").onclick = makePdf;
    $("pdfShare").onclick = () => sharePdf();
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

  // ---------- PDF report ----------
  let lastPdf = null;
  function loadScript(src) {
    return new Promise((res, rej) => { if ([...document.scripts].some(s => s.src.endsWith(src))) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Nepodařilo se načíst " + src)); document.head.appendChild(s); });
  }
  function reportData() {
    const n = Number($("exRange").value), tk = todayKey();
    let keys = Object.keys(state.days).filter(k => k <= tk).sort();
    if (n) keys = keys.filter(k => k > addDays(tk, -n));
    const from = keys[0] || tk, to = keys[keys.length - 1] || tk;
    const all = []; for (let k = from; k <= to; k = addDays(k, 1)) all.push(k);
    const s = state.settings, pt = proteinTarget();
    const days = all.map(k => {
      const d = state.days[k] || {}, p = PLAN[parseKey(k).getDay()], hs = habitsFor(k);
      return { k, today: k === tk, short: fmtShort(k), dow: DAYS_SHORT[parseKey(k).getDay()], weight: d.weight ?? null, avg7: avg7(k), kcal: d.kcal ?? null, protein: d.protein ?? null,
        sleep: sleepHours(d.bed, d.wake), energy: d.energy ?? null, plan: p.label, optional: !!p.optional, training: !!d.training,
        habits: hs.filter(h => (d.habits || {})[h.k]).length, habitsOf: hs.length, note: d.note || "", run: d.run || "",
        meals: mealsOf(d).map(m => ({ t: m.t, name: m.name, kcal: m.kcal, protein: m.protein })),
        lifts: Object.keys(d.lifts || {}).filter(id => d.lifts[id] && d.lifts[id].w != null).map(id => LIFTS[id] + " " + fmtLift(d.lifts[id])) };
    });
    const v = f => days.map(f).filter(x => x != null);
    const w = v(d => d.weight);
    const liftRows = Object.keys(LIFTS).map(id => {
      const recs = all.map(k => ({ k, l: ((state.days[k] || {}).lifts || {})[id] })).filter(x => x.l && x.l.w != null);
      if (!recs.length) return null;
      const e = x => x.w * (1 + (x.r || 1) / 30);
      const best = recs.slice().sort((a, b) => e(b.l) - e(a.l))[0];
      return { name: LIFTS[id], first: fmtLift(recs[0].l) + " (" + fmtShort(recs[0].k) + ")", last: fmtLift(recs[recs.length - 1].l) + " (" + fmtShort(recs[recs.length - 1].k) + ")", best: fmtLift(best.l) };
    }).filter(Boolean);
    const planned = days.filter(d => !d.optional).length, trained = days.filter(d => !d.optional && d.training).length;
    const hTot = days.reduce((a, d) => a + d.habitsOf, 0), hDone = days.reduce((a, d) => a + d.habits, 0);
    const sk = streaks();
    return {
      from, to, fromTxt: parseKey(from).toLocaleDateString("cs-CZ"), toTxt: parseKey(to).toLocaleDateString("cs-CZ"), generated: new Date().toLocaleString("cs-CZ"),
      settings: { ...s }, proteinTarget: pt, days, liftRows,
      summary: {
        wStart: w.length ? w[0] : null, wEnd: w.length ? w[w.length - 1] : null, wAvgEnd: avg7(to),
        kcal: avg(v(d => d.kcal)), protein: avg(v(d => d.protein)), sleep: avg(v(d => d.sleep)), energy: avg(v(d => d.energy)),
        trained, planned, chill: days.filter(d => d.optional && d.training).length, habPct: hTot ? Math.round(hDone / hTot * 100) : null,
        streak: sk.cur, best: sk.best, kcalHit: v(d => d.kcal).filter(x => x >= s.kcalTarget).length, kcalN: v(d => d.kcal).length
      }
    };
  }
  async function makePdf() {
    const btn = $("pdfBtn"), msg = $("pdfMsg");
    btn.disabled = true; msg.textContent = "Připravuji PDF…"; $("pdfShare").hidden = true;
    try {
      await loadScript("vendor/jspdf.umd.min.js");
      await loadScript("pdf.js");
      const data = reportData();
      if (!data.days.length) throw new Error("Za zvolené období nejsou žádná data.");
      const blob = await window.TVT_PDF.build(data);
      const name = "ty-vs-ty-report-" + data.from + "_" + data.to + ".pdf";
      lastPdf = new File([blob], name, { type: "application/pdf" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      msg.textContent = "PDF staženo ✓ (" + data.days.length + " dní)";
      if (navigator.canShare && navigator.canShare({ files: [lastPdf] })) $("pdfShare").hidden = false;
    } catch (e) {
      msg.textContent = /načíst/.test(e.message) && !navigator.onLine ? "PDF se poprvé musí načíst s internetem." : "PDF se nepovedlo: " + e.message;
    } finally { btn.disabled = false; }
  }
  async function sharePdf() {
    if (!lastPdf) return;
    try { await navigator.share({ files: [lastPdf], title: "Ty vs. Ty – report" }); } catch (e) { /* zrušeno */ }
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
    renderSync();
    window.addEventListener("online", renderSync); window.addEventListener("offline", renderSync);
    bindToday(); bindLifts(); bindWeekBox(); bindFood(); bindSettings(); bindAuth();
    $("sumPrev").onclick = () => { state.sumWeek = addDays(state.sumWeek || weekOf(todayKey()), -7); renderSummary(); };
    $("sumNext").onclick = () => { const n = addDays(state.sumWeek || weekOf(todayKey()), 7); if (n <= weekOf(todayKey())) { state.sumWeek = n; renderSummary(); } };
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
