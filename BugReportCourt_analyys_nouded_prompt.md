# Bug Report Court – analüüs, nõuded ja prompt

MMT5790, harjutus Claude Code (ClaudeCode2610.docx)

## 1. Analüüs

Probleem. Halvasti kirjutatud veaaruanne ("ei tööta", sammud puuduvad, keskkond teadmata) tekitab triaažis edasi-tagasi suhtlust ja viga jääb päevadeks seisma. UAT-projektides, kus testivad ärikasutajad, on see tavaline. Testijate koolitus kipub jääma üheks slaidiks, mida keegi hiljem ei mäleta.

Lahendus. Rakenduse nimi on Bug Report Court. Kasutaja kleebib veaaruande vestlusaknasse ja kohtunik annab otsuse: skoor 0–10, kohtuotsus, "süüdistused" (mis puudub) ja juhis, kuidas aruannet parandada. Toon on humoorikas ja kohati sarkastiline, et tagasisidet loetaks ja see jääks meelde.

Sihtkasutajad on UAT ärikasutajad-testijad, nooremtestijad ja arendajad, kes aruandeid vastu võtavad. Kasutus on B2B ja ettevõttesisene.

Miks reeglipõhine, mitte LLM. Hindamine on deterministlik: sama sisend annab alati sama tulemuse, mis on testitav ja seletatav. Rakendus ei vaja API-võtit ega tekita lisakulu, sest Railway prooviperioodi 5 $ läheb ainult äpile ja andmebaasile. Juhendis nõutud "Mock AI" asendub päris loogikaga, mida on harjutuse mahus realistlik ehitada.

Sobivus harjutusega. Ehitan juhendi chatboti struktuuri peale: vestluste ajalugu, sõnumid, süsteemipromptid, mudeli rippmenüü ja liugurid jäävad alles, ainult sisu on teine. Seetõttu kehtivad D7 testisammud ja F-tabelite kriteeriumid ning NA-vastuseid ei teki.

Riskid:

1. Märksõnapõhist tuvastust saab petta, kui pealkirjad on olemas, aga sisu on mõttetu. Harjutuse jaoks on see aktsepteeritav ja selle saab F2b-sse kirja panna.
2. Äpp on avalik ja autentimiseta, nii et Hall of Fame'i võib igaüks postitada. Leevenduseks on pikkusepiirang, opt-in ja kustutamise võimalus.
3. Kasutaja võib kleepida konfidentsiaalseid kliendiandmeid. Leevenduseks on hoiatusriba ja see, et Hall of Fame'i läheb sisu ainult kasutaja nõusolekul.
4. Scope creep. Esimeses versioonis on ainult veaaruanded, nõuete ja testjuhtumite hindamist ei tee.

Edukriteerium. Halb aruanne saab alla 4 punkti, hea aruanne üle 8, ja kasutaja saab otsusest aru, mida parandada, ilma lisaselgituseta.

## 2. Tabel 1 (inglise keeles, kopeerimiseks töölehele)

Ettevõtte tegevusvaldkond: Software quality assurance and testing consultancy

Toote/teenuse nimetus ja tüüp: ASA Quality Services – defect reporting training for UAT and test teams (web app "Bug Report Court")

Virtuaalassistendi nimi: Judge Thompson – a reformed tester who now judges defect reports

Rakenduse funktsioon: Training testers and business users to write good defect reports; quality check of a defect report before it is submitted

Sihtkasutajad: UAT business testers, junior testers and developers who receive defect reports (B2B, internal use)

Sisendfailid: sample_defect_reports.csv (good and bad example reports with expected score range), verdict_lines.csv (humorous verdict sentences per verdict level and sarcasm level)

## 3. Nõuded

### Funktsionaalsed

FR-01 Vestlusaken. Kasutaja kleebib veaaruande ja saadab selle. Kohtunik vastab umbes 1,5 s pärast, ootamise ajal kuvatakse teade "The judge is deliberating...".

FR-02 Hindamismootor. Reeglipõhine, ilma välise AI-ta. Hindab 8 kriteeriumit, kokku 10 punkti:

1. Pealkiri: 1 p
2. Taasesitamise sammud: 2 p (vähemalt 2 sammu; 1 samm annab 1 p)
3. Oodatud tulemus: 1,5 p
4. Tegelik tulemus: 1,5 p
5. Keskkond: 1 p
6. Tõsidus või prioriteet: 1 p
7. Tõendid (kuvatõmmis, logi, video või lisatud fail): 1 p
8. Testandmed või eeltingimused: 1 p

Lõiketabelid (aruande kohta kokku kuni −3 p):

1. Ebamäärased fraasid ("doesn't work", "broken", "ei tööta", "ASAP", "etc"): −0,5 p fraasi kohta, kokku kuni −2 p
2. Rohkem kui 30% suurtähti: −1 p
3. "!!!": −0,5 p
4. Mitu viga ühes aruandes ("also", "another issue", "lisaks veel"): −1 p

Märksõnu tuvastatakse nii inglise kui eesti keeles (Steps/Sammud, Expected/Oodatud, Actual/Tegelik, Environment/Keskkond, Severity/Tõsidus jne).

FR-03 Otsuse sisu. Otsuses on skoor, kohtuotsus, "Charges" (puuduvad või nõrgad osad), "Sentence" (humoorikas lause) ja "How to fix" (parandatud aruande mall, kuhu on täidetud see, mis olemas oli, ja märgitud see, mis puudub).

FR-04 Kohtuotsuse tasemed:

1. 0–3,9: GUILTY – report rejected
2. 4–6,9: GUILTY WITH PROBATION – rework needed
3. 7–8,9: ACQUITTED
4. 9–10: HALL OF FAME

FR-05 Kohtu tase (asendab juhendi "LLM Model" rippmenüüd):

1. Junior Court: lävendid −1 p, lõdvem
2. District Court: tavaline
3. Supreme Court: lävendid +1 p, ACQUITTED nõuab kõiki 8 kriteeriumit

FR-06 Kohtunikud (asendavad juhendi "System Prompt" rippmenüüd). Kohtunikud tulevad andmebaasist ja määravad otsuse tooni ning sissejuhatuse. Vaikimisi on kolm: Judge Thompson (reformitud testija), The Product Owner (kõik on "must have") ja The Developer On Call ("works on my machine"). "Manage Judges" aknas saab kohtunikke lisada, muuta ja kustutada.

FR-07 Liugurid (asendavad Temperature ja Top-P liugureid):

1. Sarcasm 0,0–1,0: 0–0,3 viisakas, 0,4–0,7 kuiv, 0,8–1,0 halastamatu
2. Strictness 0,0–1,0: nihutab lõiketabelite kaalu

Seaded salvestatakse iga kaasuse juurde.

FR-08 Kaasuste ajalugu (külgriba "Case Files"). Kirjel on pealkiri ja aeg. Klikk avab kaasuse, prügikast kustutab, "New Case" loob uue.

FR-09 Faili lisamine. Kirjaklambri nupp kuvab faili nime ja lisatud fail annab tõendite punkti. Faili sisu ei salvestata.

FR-10 Näidisnupp "Try a bad report". Laadib sisendväljale juhusliku näidisaruande seemneandmetest.

FR-11 Hall of Fame / Hall of Shame. Pärast otsust on nupp "Submit to Hall". Eraldi vaates on 10 parimat ja 10 halvimat aruannet koos skoori ja kohtuotsusega.

FR-12 Veakäsitlus. Tühja sõnumi saatmine on blokeeritud ja annab teate. Üle 5000 märgi pikkune sõnum annab arusaadava veateate. Kui andmebaas pole kättesaadav, kuvatakse sõbralik teade ja äpp ei jookse kokku.

### Mittefunktsionaalsed

NFR-01 Äpp jookseb Railway's koos Railway PostgreSQL-iga. Lokaalset serverit ega andmebaasi ei ole.
NFR-02 Väliseid AI API-sid ega võtmeid ei kasutata.
NFR-03 Äpp on kohanduv: külgriba on mobiilis hamburgeri all ja nupud on sõrmega vajutatavad.
NFR-04 Kasutajaliidese keel on inglise. Hindamine tunneb ära ka eestikeelsed märksõnad.
NFR-05 Hoiatusriba: "Do not paste confidential client data."
NFR-06 Hindamismootor on eraldi moodul koos ühiktestidega.

### Aktsepteerimine (D6/D7 testimiseks)

AC-01 Aruanne "Login doesn't work!!! fix ASAP" saab alla 2 punkti ja otsuse GUILTY.
AC-02 Aruanne, kus on pealkiri, 3 sammu, oodatud ja tegelik tulemus, keskkond, tõsidus, kuvatõmmis ja testkasutaja, saab vähemalt 9 punkti ja otsuse HALL OF FAME.
AC-03 Sama aruanne annab Supreme Court'is madalama või võrdse otsuse kui Junior Court'is.
AC-04 Arvutis alustatud kaasus on telefonis olemas ja püsib pärast lehe uuendamist.
AC-05 Eestikeelne aruanne (Sammud, Oodatud, Tegelik) hinnatakse samamoodi nagu ingliskeelne.

## 4. Prompt Claude Code'ile

Kasutusjärjekord: kõigepealt D2 (CLAUDE.md), siis /grill-me, siis see prompt.

```
**Project:** Build "Bug Report Court", a fully functional, responsive web app that runs on Railway (cloud hosting) with a Railway PostgreSQL database. Users paste a software defect report into a chat and an AI-style judge returns a verdict: a score 0-10, the charges (what is missing), a humorous sentence and a fixed report template. The judging is rule-based (no external AI API). Users open the app through its public Railway URL in desktop and mobile browsers; nothing runs on the developer's computer. The user interface language is English.

**Technology:**
* Choose the tech stack yourself. Keep it as simple as possible.
* Hosting constraints (Railway free trial, $5 credit): exactly one app service plus one Railway PostgreSQL database. No other services, no paid or external APIs, no API keys.
* Database: Railway PostgreSQL via the DATABASE_URL environment variable. No SQLite, no localStorage for app data. Never hard-code credentials; provide .env.example and keep .env in .gitignore.
* The server listens on the PORT environment variable.
* Database migrations and seed run automatically on deploy; the seed must be idempotent.
* The app must build with a single build command and deploy automatically from the main branch.

**1. Layout Structure**
* **Sidebar (Left, ~260px):** "Case Files" - visible on desktop, collapsible hamburger menu on mobile.
* **Main Panel (Right):** Top bar, chat area, input footer.
* A thin warning banner at the top: "Do not paste confidential client data."

**2. UI & Functional Requirements**

**A. Sidebar (Case Files):**
* List of previous cases from the database (title = first line of the first report, timestamp). Click loads the case. Hover shows a trash icon that deletes the case.
* Sticky "New Case" button at the bottom.
* Link "Hall of Fame / Shame" that opens a separate view.

**B. Top Bar:**
* "Court" dropdown: Junior Court (lenient), District Court (normal), Supreme Court (strict).
* "Judge" dropdown with judges loaded from the database, plus a "Manage Judges" button that opens a modal to add, edit and delete judges (name + description of tone + intro line).
* Default judges (seed): "Judge Thompson" (a reformed tester, stern but fair), "The Product Owner" (everything is a must-have, impatient), "The Developer On Call" (defensive, 'works on my machine').
* Settings button that opens a modal with two sliders (0.0-1.0, step 0.1, live values): "Sarcasm" and "Strictness". Settings are saved per case in the database.

**C. Chat Window:**
* User messages on the right (violet background, white text), judge messages on the left (light gray background, dark text), small timestamps.
* While waiting: "The judge is deliberating..." indicator. Simulate a 1.5 s delay.
* Judge message layout: judge name and intro line, large score (e.g. 3.5 / 10), verdict badge with colour, "Charges" list, "Sentence" (humorous line), collapsible "How to fix" section with a corrected report template, and a "Submit to Hall" button.

**D. Input Area (Bottom, Fixed):**
* Auto-expanding multiline input, placeholder "Paste your defect report...".
* "Attach File" (paperclip) shows the selected filename; the file content is not stored, but an attached file counts as evidence.
* "Try a bad report" button that loads a random sample report from the database into the input.
* "Clear Case" (secondary) and "Submit to Court" (primary) buttons.
* Empty input is blocked with a message. Input over 5000 characters shows a clear error.

**3. Judging Engine (rule-based, separate module with unit tests)**
Detect report sections by keywords in English and Estonian (e.g. Title/Pealkiri, Steps/Sammud, Expected/Oodatud, Actual/Tegelik, Environment/Keskkond, Severity/Priority/Tõsidus/Prioriteet, Screenshot/Log/Video/Kuvatõmmis/Logi, Test data/Precondition/Testandmed/Eeltingimus).
Scoring (max 10):
* Title (first line, 5-100 characters, not only vague words): 1
* Steps to reproduce, at least 2 numbered or bulleted steps (1 step = 1 point): 2
* Expected result: 1.5
* Actual result: 1.5
* Environment (env name, browser, OS, version or build): 1
* Severity or priority: 1
* Evidence (screenshot, log, video mentioned, or file attached): 1
* Test data or preconditions: 1
Penalties (max -3 in total, minimum score 0):
* Vague phrases ("doesn't work", "not working", "broken", "ASAP", "urgent", "etc", "ei tööta", "katki"): -0.5 each, max -2
* More than 30% uppercase letters: -1
* "!!!" or more: -0.5
* Several defects in one report ("also", "another issue", "lisaks veel"): -1
Strictness slider multiplies the penalties (0.0 = x0.5, 1.0 = x1.5).
Verdict levels (District Court): 0-3.9 GUILTY - report rejected; 4-6.9 GUILTY WITH PROBATION - rework needed; 7-8.9 ACQUITTED; 9-10 HALL OF FAME. Junior Court lowers thresholds by 1 point, Supreme Court raises them by 1 point and ACQUITTED or better requires all 8 criteria.
Sentence: picked from verdict lines in the database by verdict level and sarcasm level (0-0.3 polite, 0.4-0.7 dry, 0.8-1.0 savage), prefixed with the selected judge's intro line.
"How to fix": a report template (Title, Preconditions/Test data, Steps, Expected, Actual, Environment, Severity, Evidence) prefilled with what was found and "<missing>" where something is missing.

**4. Backend & Database (Railway PostgreSQL)**
* **API routes:** GET/POST /api/cases, GET/DELETE /api/cases/[id], PATCH /api/cases/[id] (settings), POST /api/cases/[id]/messages, GET/POST/PUT/DELETE /api/judges, GET /api/samples/random, GET /api/hall, POST /api/hall.
* **Persistence:** Cases, messages, judges, settings and hall entries are stored in PostgreSQL (not localStorage).
* **Prisma data model:**
  * CaseSession { id, title, court, judgeId, sarcasm, strictness, createdAt, updatedAt, messages }
  * Message { id, sessionId, role ('user' | 'judge'), content, score (nullable), verdict (nullable), inHall (boolean, default false), createdAt }
  * Judge { id, name, tone, intro, createdAt }
  * VerdictLine { id, verdict, sarcasmLevel ('polite' | 'dry' | 'savage'), text }
  * SampleReport { id, text, expectedMin, expectedMax }
* **Migrations and seed:** Prisma migrations and a seed script that adds the 3 default judges, the verdict lines and the sample reports from the CSV files in /data (sample_defect_reports.csv, verdict_lines.csv). If the CSV files are missing, create them with at least 10 sample reports (mix of bad and good, some in Estonian) and at least 3 lines per verdict and sarcasm level.
* **Hall of Fame / Shame view:** top 10 and bottom 10 judge messages with inHall = true, showing score, verdict and the original report (truncated).
* **Railway deployment:** Railway builds and deploys automatically from the main branch on GitHub. In package.json, "build" runs "prisma generate && next build" and "start" runs "prisma migrate deploy && prisma db seed && next start" (seed must be idempotent). The server listens on the PORT environment variable.
* **Error handling:** If the database is not reachable, show a friendly error message in the UI instead of crashing.

**5. Design Aesthetic**
* Modern, minimal, professional with a light courtroom touch: gavel icon in the logo, verdict badges (red, amber, green, gold).
* Palette: Slate/Zinc neutrals with Violet as the primary accent.
* Rounded corners, soft shadows, readable on mobile, buttons large enough for fingers.

**Working rules:**
* If anything is unclear, ask me. Do not make assumptions.
* If you cannot do something, tell me directly.
* Write unit tests for the judging engine, including: "Login doesn't work!!! fix ASAP" scores below 2; a complete report scores 9 or more; the same report in Estonian scores the same as in English.
```
