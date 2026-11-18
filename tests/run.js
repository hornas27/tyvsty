// Spouštěč smoke testů appky Ty vs. Ty.
// Použití:  cd tests && npm install && npx playwright install chromium && node run.js [nazev ...]
// Spustí 2 lokální servery nad složkou appky:
//   DEMO (port 8766) – config.js se podstrčí s apiKey "VLOZ" → appka jede v demo režimu (data v localStorage, žádný Firebase)
//   REAL (port 8767) – skutečný config.js (jen pro scénář fatal-vs-demo, gstatic se v něm blokuje)
// Čas v prohlížeči je zafixovaný na FAKE_NOW (scénáře počítají s neděli 15. 11. 2026).
// Každý scénář vypíše JSON. FAIL = spadl, nebo hlásí chyby stránky ("errs"/"ERRORS" není prázdné).
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(__dirname, "out");
const DEMO_CONFIG = `window.FIREBASE_CONFIG = { apiKey: "VLOZ", authDomain: "x", projectId: "x", appId: "x" };
window.RECAPTCHA_SITE_KEY = "VLOZ";
window.GCAL_CLIENT_ID = "test-client.apps.googleusercontent.com";`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf", ".css": "text/css" };
function serve(port, demo) {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
      if (demo && p === "/config.js") { rsp.writeHead(200, { "Content-Type": "text/javascript" }); return rsp.end(DEMO_CONFIG); }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(rsp);
    }).listen(port, () => res(s));
  });
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const servers = [await serve(8766, true), await serve(8767, false)];
  const all = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && f !== "run.js").map(f => f.slice(0, -3));
  const pick = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const env = { ...process.env, OUT, DEMO_URL: "http://localhost:8766/", REAL_URL: "http://localhost:8767/", FAKE_NOW: "2026-11-15T12:00:00" };
  let fails = 0;
  for (const name of pick) {
    const r = await new Promise(resolve => {
      const { spawn } = require("child_process");
      const c = spawn(process.execPath, [path.join(__dirname, name + ".js")], { env }); let out = "";
      c.stdout.on("data", d => out += d); c.stderr.on("data", d => out += d); c.on("close", code => resolve({ code, out }));
    });
    const errsBad = /"errs":\s*\[\s*"/.test(r.out) || /ERRORS:\s*\[\s*'(?!Failed to load resource)/.test(r.out);
    const ok = r.code === 0 && !errsBad; if (!ok) fails++;
    console.log((ok ? "PASS " : "FAIL ") + name);
    if (!ok || process.env.VERBOSE) console.log(r.out.split("\n").map(l => "   " + l).join("\n"));
  }
  servers.forEach(s => s.close());
  console.log(fails ? fails + " scénářů selhalo" : "Vše prošlo. Výstupy (screenshoty, PDF) jsou v tests/out/.");
  process.exit(fails ? 1 : 0);
})();
