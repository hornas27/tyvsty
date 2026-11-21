// Ty vs. Ty – odhad jídla přes Gemini (Firebase AI Logic). Načítá se jako ES modul.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";

// Zkouší modely postupně – když jeden Google vypne, přejde se na další.
// Při přetížení nebo vyčerpaném limitu jednoho modelu jde na další (každý má vlastní limit).
const MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

const PROMPT = `Jsi přesný výživový poradce. Odhadni nutriční hodnoty jídla z fotky a/nebo z popisu.
Uživatel žije v Česku (české porce a potraviny). Počítej celou porci, která je na fotce nebo v popisu.
Nezapomeň na olej, máslo, omáčky a dresinky, pokud jsou vidět nebo jsou u takového jídla obvyklé.
Když uživatel uvede gramáž nebo počet kusů, drž se jí přesně.
Vrať POUZE JSON přesně v tomto tvaru (žádný další text):
{"name":"krátký český název celého jídla","items":[{"name":"složka","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0}],"kcal":0,"protein":0,"carbs":0,"fat":0,"confidence":"nízká|střední|vysoká","note":"jedna krátká věta, co mohlo odhad nejvíc zkreslit"}
Hodnoty kcal a gramy živin zaokrouhli na celá čísla; součty musí odpovídat položkám.
Když na fotce není jídlo, vrať prázdné items, nuly a do note napiš proč.`;

let ai = null, modelIdx = 0; // modelIdx posune jen model, který přestal existovat

function getAi() {
  if (ai) return ai;
  const app = initializeApp(window.FIREBASE_CONFIG, "tvt-ai");
  const key = window.RECAPTCHA_SITE_KEY;
  if (key && !String(key).startsWith("VLOZ")) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: true });
  }
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

const n = v => { const x = Math.round(Number(v)); return isFinite(x) && x >= 0 ? x : 0; };

function parse(text) {
  const raw = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const j = JSON.parse(raw);
  const items = Array.isArray(j.items) ? j.items.map(i => ({
    name: String(i.name || "").slice(0, 60), grams: n(i.grams), kcal: n(i.kcal), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat)
  })) : [];
  const sum = k => items.reduce((a, i) => a + i[k], 0);
  return {
    name: String(j.name || (items[0] && items[0].name) || "Jídlo").slice(0, 60),
    items,
    kcal: n(j.kcal) || sum("kcal"), protein: n(j.protein) || sum("protein"),
    carbs: n(j.carbs) || sum("carbs"), fat: n(j.fat) || sum("fat"),
    confidence: String(j.confidence || ""), note: String(j.note || "").slice(0, 200)
  };
}

// zkouší modely postupně; při přetížení / limitu jde na další
async function runModels(parts, temperature) {
  let lastErr;
  for (let i = modelIdx; i < MODELS.length; i++) {
    try {
      const model = getGenerativeModel(getAi(), { model: MODELS[i], generationConfig: { responseMimeType: "application/json", temperature } });
      const res = await model.generateContent(parts);
      return { text: res.response.text(), model: MODELS[i] };
    } catch (e) {
      lastErr = e;
      const msg = String((e && (e.message || e.code)) || e);
      if (/not[ _-]?found|\[404|is not supported|unsupported model|does not exist/i.test(msg)) { modelIdx = Math.min(i + 1, MODELS.length - 1); continue; }
      // přetížený model nebo vyčerpaný limit daného modelu → zkus další model
      if (/high demand|overloaded|unavailable|try again later|\[50[0-4]|\[429|quota|resource.?exhausted|rate.?limit/i.test(msg)) continue;
      break; // jiná chyba (App Check, síť…) – další model by nepomohl
    }
  }
  throw lastErr;
}

async function estimate({ image, text, hint }) {
  const parts = [PROMPT];
  if (text) parts.push("Popis jídla od uživatele: " + text);
  if (hint) parts.push("Upřesnění od uživatele (má přednost): " + hint);
  if (image) parts.push({ inlineData: { data: image.data, mimeType: image.mime } });
  const r = await runModels(parts, 0.2);
  return { ...parse(r.text), model: r.model };
}

// ---------- běžecký trenér ----------
const COACH = `Jsi zkušený osobní běžecký trenér Marka. Mluvíš česky, krátce, věcně, tykáš mu.
Marek kromě běhu chodí 4× týdně do posilovny (plán dnů dostaneš). Pravidla, která vždy dodržuješ:
- Cca 80 % objemu lehce (konverzační tempo / zóna 2), max 20 % kvalitně (tempo, intervaly).
- Týdenní objem běhu zvyšuj nejvýš o 10 % proti průměru posledních 3 týdnů; každý 4. týden odlehčení (−20 až −30 %).
- Žádné intervaly ani tempo den po posilování nohou; dlouhý běh nedávej den před nohama.
- Když málo spal, má nízkou energii nebo hlásí bolest, uber intenzitu. Zranění z profilu ber vážně.
- Drž se jeho tep. zón a temp z profilu. Když něco nevíš, buď konzervativní.
- Tréninky piš konkrétně: rozklus, hlavní část (vzdálenost/čas, tempo min/km nebo tep. zóna), výklus.
- Nic si nevymýšlej o jeho minulosti – vycházej jen z profilu a dat.`;

const PLAN_TASK = `Úkol: naplánuj běhy na zadaný týden. Běžecké dny a jejich role máš v datech (dny a datumy přesně dodrž, nic nepřidávej).
Vrať POUZE JSON:
{"intro":"1–2 věty: cíl týdne a proč","days":[{"key":"YYYY-MM-DD","title":"krátký název, např. Intervaly 6× 800 m","km":0,"text":"celý trénink, řádky oddělené \n"}],"tip":"1 věta: na co si dát pozor"}
km = celkové km tréninku včetně rozklusu (číslo).`;

const REVIEW_TASK = `Úkol: rozbor běhu, který Marek právě zapsal (plán vs. skutečnost, tempo, tep, pocit, poznámka) v kontextu posledních týdnů.
Když je potřeba, uprav NEJBLIŽŠÍ další naplánovaný běh (key a nový celý text). Když úprava není potřeba, dej "next": null.
Vrať POUZE JSON:
{"verdict":"good|ok|warn","head":"krátké shrnutí do 8 slov","text":"2–4 věty rozboru","next":{"key":"YYYY-MM-DD","text":"nový celý trénink"} }`;

const ASK_TASK = `Úkol: odpověz na Markovu otázku. Max 6 vět, konkrétně podle jeho dat.
Vrať POUZE JSON: {"answer":"odpověď"}`;

function coachParts(task, ctx, extra) {
  const parts = [COACH, task];
  parts.push("PROFIL BĚŽCE (od jeho dosavadního trenéra):\n" + (ctx.profile || "(profil zatím chybí – buď konzervativní)"));
  parts.push("DATA Z APLIKACE:\n" + JSON.stringify(ctx.data));
  if (extra) parts.push(extra);
  return parts;
}
const txt = (v, m) => String(v == null ? "" : v).slice(0, m);

async function runPlan(ctx) {
  const r = await runModels(coachParts(PLAN_TASK, ctx), 0.4);
  const j = JSON.parse(String(r.text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  return {
    intro: txt(j.intro, 400), tip: txt(j.tip, 300), model: r.model,
    days: (Array.isArray(j.days) ? j.days : []).map(d => ({ key: txt(d.key, 10), title: txt(d.title, 80), km: Number(d.km) > 0 ? Math.round(Number(d.km) * 10) / 10 : null, text: txt(d.text, 1200) })).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.key))
  };
}
async function runReview(ctx) {
  const r = await runModels(coachParts(REVIEW_TASK, ctx), 0.3);
  const j = JSON.parse(String(r.text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  const nx = j.next && /^\d{4}-\d{2}-\d{2}$/.test(j.next.key) && j.next.text ? { key: j.next.key, text: txt(j.next.text, 1200) } : null;
  return { verdict: ["good", "ok", "warn"].includes(j.verdict) ? j.verdict : "ok", head: txt(j.head, 80), text: txt(j.text, 800), next: nx, model: r.model };
}
async function runAsk(ctx, question) {
  const r = await runModels(coachParts(ASK_TASK, ctx, "OTÁZKA: " + txt(question, 600)), 0.5);
  const j = JSON.parse(String(r.text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  return { answer: txt(j.answer, 1500), model: r.model };
}

// přečtení běhu ze screenshotu / fotky (hodinky, Samsung Health, Strava…)
const SHOT_TASK = `Na obrázcích je záznam jednoho běhu (screenshot z hodinek nebo aplikace, případně víc obrazovek téhož běhu).
Přečti hodnoty přesně tak, jak jsou na obrázku. Nic neodhaduj ani nedopočítávej; co tam není, dej null.
Vrať POUZE JSON:
{"km":0,"time":"h:mm:ss nebo mm:ss","hr":0,"hrMax":0,"pace":"m:ss/km","cadence":0,"elevation":0,"calories":0,"date":"YYYY-MM-DD nebo null","splits":"krátce tempa po km, pokud jsou vidět, jinak null","other":"další užitečné údaje (zóny, VO2max, trénink. efekt…) v 1 větě, nebo null","isRun":true}
Když to není záznam běhu, dej "isRun": false.`;
async function runFromImages(images) {
  const parts = [SHOT_TASK, ...images.map(im => ({ inlineData: { data: im.data, mimeType: im.mime } }))];
  const r = await runModels(parts, 0);
  const j = JSON.parse(String(r.text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  const pos = v => { const x = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) && x > 0 ? x : null; };
  return { isRun: j.isRun !== false, km: pos(j.km), time: j.time ? txt(j.time, 12) : null, hr: pos(j.hr), hrMax: pos(j.hrMax), pace: j.pace ? txt(j.pace, 12) : null, cadence: pos(j.cadence), elevation: pos(j.elevation), calories: pos(j.calories), date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || "") ? j.date : null, splits: j.splits ? txt(j.splits, 300) : null, other: j.other ? txt(j.other, 300) : null, model: r.model };
}

window.TVT_AI = { estimate, runPlan, runReview, runAsk, runFromImages };
