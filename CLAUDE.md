# Ty vs. Ty – předávka pro Claude Code

Osobní PWA tracker Marka (váha, kcal, bílkoviny, spánek, energie, trénink a progresivní přetížení, návyky, jídlo přes AI, poznámky, úkoly s Google Kalendářem).
Živě: https://hornas27.github.io/tyvsty/ (GitHub Pages z větve `main`, kořen repa).

## Pravidla spolupráce (od Marka)
- Komunikace česky, krátce, přímo. UI texty appky česky.
- **Větší změny dělej až po souhlasu.** Napřed krátce navrhni, co a jak, pak stav. Malé opravy klidně rovnou.
- Tohle je **osobní projekt**. Nepropojovat s Mavric.Group, mavric-brain repem ani dropshippingem (žádné odkazy, sdílené soubory, connectory).
- Repo je **veřejné** (kvůli Pages) → do repa nikdy osobní data, e-maily, hesla, tokeny. Firebase config a OAuth client ID veřejné být smí (data chrání Firestore pravidla).
- **Nic placeného.** Firebase zůstává na Spark plánu, Google Cloud projekt nemá billing účet a mít ho nebude. Nikdy nenavrhuj „Start free“, upgrade ani nic, co chce kartu.
- Hesla, souhlasy (OAuth consent, podmínky) a přihlášení dělá Marek sám.

## Stack
- Vanilla JS, žádný build. `index.html` (HTML + veškeré CSS), `app.js` (celá logika v jednom IIFE), `ai.js` (ES modul, odhad jídla), `pdf.js` (PDF report, jsPDF z `vendor/`), `sw.js` (service worker), `config.js`, `manifest.json`.
- Firebase **compat SDK 10.12.2** (auth + firestore, `enablePersistence`) z gstatic. Přihlášení e-mail/heslo, registrace v Auth vypnutá (jen Markův účet).
- AI: Firebase AI Logic v `ai.js` (modulární SDK 12.19.0, App Check reCAPTCHA Enterprise, klíč v `config.js`). Řetěz modelů s fallbackem v `MODELS`.
- Fonty self-hosted v `fonts/` (Big Shoulders Display 800/900, DM Sans 400/500/700; DejaVu pro PDF).

## Data (Firestore, vše pod `users/{uid}`)
- `days/{YYYY-MM-DD}` – zápis dne, vždy `set(data, {merge:true})`. Pole mj.: ex[] (pořadí cviků jen pro tento týden), weight, kcal, protein, carbs, fat, bed, wake, energy, training, habits{}, lifts{id:{w,r}}, meals[], run, note, **plan** (číslo dne v týdnu, jehož trénink se ten den dělá – prohození tréninků; null = podle kalendáře).
- `meta/settings` – planEx{den:[id]} (cviky dne natrvalo), kcalTarget, targetWeight, favorites[], noteFolders[], kodexSeeded, calTrash[] (ID událostí ke smazání v kalendáři), … Ukládá se celé přes `set` (`saveSettingsPatch`).
- `notes/{id}` – {folder, text, order, createdAt, updatedAt, done, doneAt, remindAt "YYYY-MM-DDTHH:MM", reminded, calMode "app"|"both"|"cal", calEventId, calPending}.
- Firestore pravidla: přístup jen vlastník (anonymně 403 – ověřeno).

## Důležité části app.js
- `DEMO` = apiKey začíná na "VLOZ" → data v localStorage (`tvt-days`, `tvt-settings`, `tvt-notes`). S reálným configem a nenačteným Firebase → `showFatal()` („Nepřipojeno“), nikdy tiše demo.
- `PLAN` (týdenní plán po dnech), `planKey(k)` / `planOf(k)` – trénink dne včetně prohození. Vždy používej `planOf(k)`, ne `PLAN[den]`.
- Prohození: `renderSwap`, `swapPlan(a,b)` (prohodí i `run` text), `resetWeekPlan`. Jen v rámci týdne Po–Ne → počet tréninků v týdnu sedí (6 povinných).
- `HABITS` (s `since` pro návyky přidané později, `perWeek` = X× týdně, např. `rannibeh` 3× týdně), `habitDefs()` = HABITS + `settings.customHabits` (vlastní návyky z Nastavení nebo odkazem `#navyk=Název&tydne=N` → `habitFromLink` – soukromé, nikdy je nepiš do kódu, repo je veřejné). `habitsFor(k)` = jen denní (skóre, série, mapa), `weeklyFor(k)` + `weeklyCount` = týdenní.
- **Kouč** (Dnes, `#coachCard`, jen pro dnešek): `readiness` (0–100 ze spánku, času usnutí, energie a tréninků za 2 dny), `coachPlan` (vážení, trénink s návrhem váhy, jídlo podle včerejška, týdenní návyky, spánek), `coachWatch` (max 3: problémy bad/warn + 1 pochvala; „Beru“ = `settings.coachSnooze[id]` na 2 dny), `renderCoach` volaný z `renderTodayDerived`. Pevná pravidla, bez AI. Vypínač `settings.coachOff`.
- Ukládání: `patchDay` (debounce 600 ms) + `flushSave` na pagehide/visibility/přepnutí dne, `trackSave` → indikátor synchronizace.
- Progresivní přetížení: každý cvik v `PLAN` má ID (3. prvek) a zapisuje se nejtěžší série; `LIFTS` (všechny cviky, stejné ID = společná historie, např. `lateral`, `bayes`, `triceps`), `MAIN_LIFTS` (6 hlavních pro zeď rekordů), `LIFT_STEP` (výchozí 2,5), `liftHistory`, `liftSuggestion` (8+ opak. → +krok; 6–7 → stejná váha +1 opak.; 2× pod 6 → −krok), `liftCompare` (víc/stejně/míň než minule), `liftStalled` (3× stejně), e1RM = w·(1+r/30).
- Vlastní / přejmenované cviky: `settings.exDefs = {id: {name, sets, custom?, since}}` (jen Firestore), `syncEx()` je promítne do `EX` a `LIFTS` (volá se v `renderToday`/`renderCurrent`). V tréninku „+ Přidat cvik“ (název ze seznamu = existující ID, společná historie; nový = `x…` ID), v menu ⋯ „Upravit“ (název, série) a „Odebrat“ (podle Jen tento týden / Natrvalo, historie zůstává). Síla v Přehledu má skupinu „Další cviky“ pro cviky mimo trvalý plán.
- **Běžecký trenér** (části 1–4 hotové): profil `settings.runProfile` (+ `runProfileAt`) v Nastavení `#rpCard`, prompt `RUN_PROFILE_PROMPT`. `coachCtx(extra)` = profil + běhy 8 týdnů (`day.run` plán, `day.runLog` výsledek) + km po týdnech + regenerace 7 dní + gym dny + připravenost. Návrh týdne: okno „Běhy na týden“ `#weekBox` → „Navrhne trenér“ (`coachPlanWeek` → `TVT_AI.runPlan`) → náhled v `wb-1/4/6` → „Rozložit do dní“ (uloží `day.run`). Zápis běhu na běžecký den `#runLog`: `day.runLog = {km, sec, hr, feel 1–5, note, review}`; „Rozbor od trenéra“ (`runReview`, umí navrhnout úpravu nejbližšího dalšího běhu → „Použít úpravu“), „Zeptat se trenéra“ (`runAsk`, neukládá se). „Ze screenshotu“ (`runFromPhoto` → `TVT_AI.runFromImages`, až 3 obrázky, 1600 px) vyplní km, čas, tep a do `runLog.extra` dá max tep, kadenci, převýšení, úseky; obrázky se neukládají. Pravidla trenéra jsou v promptu `COACH` v `ai.js`; v demu odpovídá `demoAI`. Zbývá část 5: hlídání pravidly přímo v appce (skok objemu, spánek před intervaly) a export/import pro placené Gemini.
- Cviky dne: `exIdsFor(k)` (pořadí = `day.ex` jen pro tento týden › `settings.planEx[číslo dne plánu]` natrvalo › `PLAN`), `planExIds(dn)`, `EX` (id → název, série). Menu ⋯ u cviku: ↑/↓, přesun na jiný gym den týdne, přepínač Jen tento týden / Natrvalo (`editEx`), „Vrátit původní cviky“.
- Přehled = sekce Váha (`#wCard`), Síla (`#strengthSum` + top 3 změny, detail `renderStrength` + rekordy), Jídlo (`renderFood`), Spánek, Návyky (detail mapa roku + cíle); každá sekce má vlastní `<details class="det">`, žádný společný „Víc detailů“. Historie dní je v Nastavení (`#histCard`), záložky jsou 4: Dnes, Přehled, Poznámky, Nastavení. Týdenní souhrn zrušen. Spánek: (`renderSleepCard`, stabilita = rozptyl délky a času usínání; `sleepTimeline` = 7 nocí jako čáry usnutí→vstávání, cílové okno `SLEEP_WIN` 22:30–23:30; návyky `habitTable` = návyk × den, krátké názvy `HABITS[].s`).
- **Bilance týdne** (`#v-review`, mimo záložky; otevře se z Přehledu `#openReview` nebo bannerem v neděli od 17 h / v pondělí bez cíle): `reviewStats`/`reviewRows` (váha, síla, tréninky, jídlo, spánek, návyky) a cíl na týden `settings.weekGoals[pondělí] = {type: habit|kcal|bed|text, k, n, t}`, `goalProgress`, `goalSuggestions`. Kouč dává cíl do plánu a hlídá ho.
- Soukromé soubory (např. export ze Samsung Health) patří do `private/` (v `.gitignore`).
- Váha na Přehledu: `renderWeightCard` (graf `weightChart` s rozsahem 4 týdny/3 měsíce/vše v `localStorage["tvt-wrange"]`, týden po týdnu `weekWeight` + `weekChange` = Ø týdne proti Ø minulého), na Dnes řádek `#weightWeek`.
- Poznámky/úkoly: `folders()`, `isTasks()`, `renderNotes`, `bindNotes`, `checkReminders` (in-app připomínky, každých 20 s), `renderTaskBanner`.
- **Google Kalendář** (sekce „Google Kalendář“): GIS token client (`accounts.google.com/gsi/client`), scope `calendar.events`, token jen na klepnutí uživatele (popup), v sessionStorage `tvt-gtok`. `calSync(id)` dorovná událost podle úkolu (vytvořit / PATCH / DELETE při hotovo nebo smazání), chyby → `calPending` + tlačítko „Synchronizovat kalendář“. Režim „cal“ potlačí in-app připomínku.
  - Google Cloud projekt `tyvsty-aa163`: OAuth klient „Ty vs. Ty web“ (origin jen `https://hornas27.github.io`), consent screen v režimu **Testing** s jediným test userem (Markův účet). Calendar API zapnuté. Neověřená appka → Google ukáže varování, Marek klikne Pokračovat. Token v Testing režimu platí ~1 h, refresh na klepnutí.

## Cache a verze – NUTNÉ při každém nasazení
- `index.html` načítá `config.js?v=N`, `app.js?v=N`, `ai.js?v=N`, ikony `?v=N`. Při změně souboru **zvyš jeho `?v=`** (jinak telefon drží starý JS s novým HTML).
- `sw.js`: `CACHE = "tvt-vN"` – **zvyš při každém nasazení**. Same-origin network-first, `ignoreSearch` fallback; `LIBS` (`tvt-libs-1`, gstatic firebase) cache-first a zůstává napříč verzemi.
- `manifest.json` se v `index.html` odkazuje **bez** `?v=` (jinak se rozbije aktualizace WebAPK ikony).
- Aktuálně: app.js v34, config v20, ai v22, `CACHE = "tvt-v36"`.

## Nasazení
1. Změny + testy (níže) + lint.
2. `git add -A && git commit -m "…" && git push` na `main` → GitHub Pages nasadí za ~1 min.
3. Ověř živě: `https://hornas27.github.io/tyvsty/app.js?v=N` obsahuje změnu; v appce žádné chyby v konzoli.

## Testy
Smoke scénáře v `tests/` (Playwright). Spouštěč pustí lokální server: port 8766 = demo (podstrčí config s "VLOZ"), 8767 = reálný config (gstatic blokovaný). Čas v prohlížeči je zafixovaný na neděli 15. 11. 2026 (`FAKE_NOW` v `run.js`), kalendář Google je v testu mockovaný.
```
cd tests
npm install
npx playwright install chromium
npm test                 # všechny scénáře, PASS/FAIL
node run.js poznamky     # jen vybrané
VERBOSE=1 node run.js    # vypíše i JSON výstupy
npm run lint             # eslint 8 (0 chyb; 2 staré warningy jsou ok)
```
Scénáře: core, navyky-export, ukladani-flush, pretizeni-mapa-rekordy, fatal-vs-demo, poznamky, ukoly-pripominky, google-kalendar, prohozeni-treninku, vaha-cviky, cviky-presun, kouc, bilance, cviky-upravy, bezecky-trener. Jsou to smoke testy (JSON výstup + kontrola chyb stránky), ne přesné asserty – po změně se podívej i na výstup a screenshoty v `tests/out/`.
Nejdřív vytvoř `.gitignore` s `tests/node_modules/` a `tests/out/`, ať se to necommitne.

## Design (Graphite, výchozí tmavý)
- Paleta **Graphite** (černá, grafit, ocel, křída; barva jen pro stav good/warn/bad). Tokeny v `:root` (světlý) a `html[data-theme="dark"]` (výchozí); jména tokenů (`--cobalt`, `--sage`, `--coral`…) zůstala historická, ale mají šedé/bílé hodnoty. `--hero`, `--train` = hlavička a blok tréninku. Přepínač ukládá `localStorage["tvt-theme2"]`. Náčrt vzhledu v `design/` (necommitovat).
- Plovoucí pilulková navigace se 4 záložkami (Dnes, Přehled, Poznámky, Nastavení). Testy hledají záložky přes `data-view`.
- Logo „T / T“ (bílé T = ty dnes, šedé T = ty včera, lomítko); zdroj `icons/logo.svg`, PNG se renderují z něj (Playwright screenshot, maskable se zmenšením .78), v hlavičce inline `.brand .mark`.

## Nápady / backlog (nic z toho neschváleno, napřed se zeptej)
- Normální osobní kalendář přímo v appce (Marek chce „později“).
- Napojení Samsung Health (kroky, běhy, spánek) – z webu přímo nejde; varianty: Android most, import exportu.
- Ze statistik ukázat, jak vypadají dny se splněným „Vstal jsem na 1 budík“ vs. ostatní.
