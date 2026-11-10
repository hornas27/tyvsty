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

async function estimate({ image, text, hint }) {
  const parts = [PROMPT];
  if (text) parts.push("Popis jídla od uživatele: " + text);
  if (hint) parts.push("Upřesnění od uživatele (má přednost): " + hint);
  if (image) parts.push({ inlineData: { data: image.data, mimeType: image.mime } });
  let lastErr;
  for (let i = modelIdx; i < MODELS.length; i++) {
    try {
      const model = getGenerativeModel(getAi(), { model: MODELS[i], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
      const res = await model.generateContent(parts);
      return { ...parse(res.response.text()), model: MODELS[i] };
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

window.TVT_AI = { estimate };
