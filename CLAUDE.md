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
- `HABITS` (s `since` pro návyky přidané později), `habitsFor(k)`.
- Ukládání: `patchDay` (debounce 600 ms) + `flushSave` na pagehide/visibility/přepnutí dne, `trackSave` → indikátor synchronizace.
- Progresivní přetížení: každý cvik v `PLAN` má ID (3. prvek) a zapisuje se nejtěžší série; `LIFTS` (všechny cviky, stejné ID = společná historie, např. `lateral`, `bayes`, `triceps`), `MAIN_LIFTS` (6 hlavních pro zeď rekordů), `LIFT_STEP` (výchozí 2,5), `liftHistory`, `liftSuggestion` (8+ opak. → +krok; 6–7 → stejná váha +1 opak.; 2× pod 6 → −krok), `liftCompare` (víc/stejně/míň než minule), `liftStalled` (3× stejně), e1RM = w·(1+r/30).
- Cviky dne: `exIdsFor(k)` (pořadí = `day.ex` jen pro tento týden › `settings.planEx[číslo dne plánu]` natrvalo › `PLAN`), `planExIds(dn)`, `EX` (id → název, série). Menu ⋯ u cviku: ↑/↓, přesun na jiný gym den týdne, přepínač Jen tento týden / Natrvalo (`editEx`), „Vrátit původní cviky“.
- Přehled = 4 otázky: Nabírám? (`#wCard`), Zvedám víc? (`#strengthSum` + `renderStrength`), Jsem lepší v návycích?, Mám stabilní spánek? (`renderSleepCard`, stabilita = rozptyl délky a času usínání). Zbytek (souhrn týdne, kalorie, bílkoviny, mapa roku, rekordy, cíle) v `<details id="moreBox">` „Víc detailů“.
- Váha na Přehledu: `renderWeightCard` (graf `weightChart` s rozsahem 4 týdny/3 měsíce/vše v `localStorage["tvt-wrange"]`, týden po týdnu `weekWeight` + `weekChange` = Ø týdne proti Ø minulého), na Dnes řádek `#weightWeek`.
- Poznámky/úkoly: `folders()`, `isTasks()`, `renderNotes`, `bindNotes`, `checkReminders` (in-app připomínky, každých 20 s), `renderTaskBanner`.
- **Google Kalendář** (sekce „Google Kalendář“): GIS token client (`accounts.google.com/gsi/client`), scope `calendar.events`, token jen na klepnutí uživatele (popup), v sessionStorage `tvt-gtok`. `calSync(id)` dorovná událost podle úkolu (vytvořit / PATCH / DELETE při hotovo nebo smazání), chyby → `calPending` + tlačítko „Synchronizovat kalendář“. Režim „cal“ potlačí in-app připomínku.
  - Google Cloud projekt `tyvsty-aa163`: OAuth klient „Ty vs. Ty web“ (origin jen `https://hornas27.github.io`), consent screen v režimu **Testing** s jediným test userem (Markův účet). Calendar API zapnuté. Neověřená appka → Google ukáže varování, Marek klikne Pokračovat. Token v Testing režimu platí ~1 h, refresh na klepnutí.

## Cache a verze – NUTNÉ při každém nasazení
- `index.html` načítá `config.js?v=N`, `app.js?v=N`, `ai.js?v=N`, ikony `?v=N`. Při změně souboru **zvyš jeho `?v=`** (jinak telefon drží starý JS s novým HTML).
- `sw.js`: `CACHE = "tvt-vN"` – **zvyš při každém nasazení**. Same-origin network-first, `ignoreSearch` fallback; `LIBS` (`tvt-libs-1`, gstatic firebase) cache-first a zůstává napříč verzemi.
- `manifest.json` se v `index.html` odkazuje **bez** `?v=` (jinak se rozbije aktualizace WebAPK ikony).
- Aktuálně: app.js v25, config/ai v20, `CACHE = "tvt-v25"`.

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
Scénáře: core, navyky-export, ukladani-flush, pretizeni-mapa-rekordy, fatal-vs-demo, poznamky, ukoly-pripominky, google-kalendar, prohozeni-treninku, vaha-cviky, cviky-presun. Jsou to smoke testy (JSON výstup + kontrola chyb stránky), ne přesné asserty – po změně se podívej i na výstup a screenshoty v `tests/out/`.
Nejdřív vytvoř `.gitignore` s `tests/node_modules/` a `tests/out/`, ať se to necommitne.

## Design (Graphite, výchozí tmavý)
- Paleta **Graphite** (černá, grafit, ocel, křída; barva jen pro stav good/warn/bad). Tokeny v `:root` (světlý) a `html[data-theme="dark"]` (výchozí); jména tokenů (`--cobalt`, `--sage`, `--coral`…) zůstala historická, ale mají šedé/bílé hodnoty. `--hero`, `--train` = hlavička a blok tréninku. Přepínač ukládá `localStorage["tvt-theme2"]`. Náčrt vzhledu v `design/` (necommitovat).
- Plovoucí pilulková navigace s 5 záložkami (Dnes, Přehled, Historie, Poznámky, Nastavení). Testy hledají záložky přes `data-view`.
- Logo „Zrcadlo“ (T + korálový odraz) v `icons/`.

## Nápady / backlog (nic z toho neschváleno, napřed se zeptej)
- Normální osobní kalendář přímo v appce (Marek chce „později“).
- Napojení Samsung Health (kroky, běhy, spánek) – z webu přímo nejde; varianty: Android most, import exportu.
- Ze statistik ukázat, jak vypadají dny se splněným „Vstal jsem na 1 budík“ vs. ostatní.
