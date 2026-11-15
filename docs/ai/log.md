# Persistenz-Log

## 2026-11-15 — „All Imports" und Namenskonvention Import vs. Upload (#223)

* **Update**: `CONVENTIONS.md` (neuer Abschnitt „Terminology" — Import =
  Domänenobjekt, Upload = Byte-Transport, Vorlage = Upload), `DOMAIN.md` und
  `ARCHITECTURE.md` („an import commits directly", Seiten-/Komponentenbeschreibung
  nachgezogen), `STATE.md` (Eintrag zu #223).
* **Creation**: #223 (Admin-GUI: Tab „All Imports", Spalte „Imported by",
  Namenskonvention).
* **Reason**: „Upload" und „Import" wurden gemischt verwendet (Sidebar „Upload"
  neben „My Imports", Seite „Upload Excel Files" neben „Importing…", Code
  `uploadService` vs. `importService`). Entscheidung: „Import" ist der Datensatz,
  „Upload" nur der Transport; die Spalte „Uploaded by" im Admin-Tab hieß falsch.
* **Verifikation**: Lint 0 Fehler / 12 vorbestehende Warnungen, Typecheck,
  370 Tests grün; Komponenten ohne jsdom nicht testbar (Commit-Message).
  Issue #223 geschlossen.

## 2026-11-15 — Backlog-Triage: 27 Issues geschlossen, Doku-Drift nachgezogen (#222)

* **Update**: `STATE.md` (zwei Aussagen „`QUERY_DATABASE_URL` fehlt auf Prod"
  korrigiert — seit dem Cutover gesetzt), `DECISIONS.md` (Adoption 2026-10-18 als
  überholt markiert; neue Entscheidung „Artenpflege im Admin-GUI,
  `species.json` nur Bootstrap"), `DOMAIN.md` (`Imports` statt
  `Uploads`-State-Machine, Rollen `USER`/`ADMIN`/`SUPER_ADMIN`, Import- und
  Artenregeln, Runner „läuft" statt „geplant"), `HANDOFF.md` (Triage-Block,
  Checkboxen 7/9/10/18 auf erledigt, Items 11/16c auf #220, Item 19 auf #221).
* **Creation**: #221 (`deploy-dev.yml` deployt auch auf `master`), #219
  (inhaltliche Duplikaterkennung beim Upload), #220 (Docker-Reste auf dem
  Prod-Host), #222 (dieses Triage-Issue).
* **Reason**: 54 offene Issues waren über Wochen gewachsen; 27 waren erledigt
  oder durch #200/#202/#184 überholt. Jede Schließung hat einen Beleg-Kommentar
  (Commit, Datei:Zeile oder Nachfolger-Issue). Live-Befund dabei: Docker läuft
  auf dem Prod-Host noch (`29.9.3`, `enabled`+`active`, `clx-postgres` gestoppt,
  drei benannte plus vier anonyme Volumes) — Grundlage für #220 und für die
  Neubewertung von #159.
* **Verifikation**: `gh issue list` zeigt 31 offene Issues (27 Rest + 4 neue);
  keine Schließung mit offenen Sub-Issues (#132 vor #88 geschlossen; #204 und
  #183 hatten nur geschlossene). Issue #222 geschlossen.

## 2026-11-15 (Nachtrag) — #174 Stufe 3 reisefertig entschieden

* **Update**: `HANDOFF.md` Aufgabe 21 — xlsx → CDN-Pin 0.20.3 (Variante A, Rückfall A′
  `vendor/`), nodemailer 7.0.13 → 10.5.0, exceljs bleibt gepinnt (optional `overrides`
  uuid ^11.1.1), eslint 10 / typescript 7 / lucide 1.x separat.
* **Reason**: Das Advisory CVE-2023-30533 (CVSS 7.8) trifft genau unseren Lesepfad
  (`XLSX.read` auf Nutzer-Uploads); 0.20.3 ist die aktuelle CDN-Version und von der
  Prod-Maschine erreichbar (200, 61 ms). Paket-Bilanz als Nebenargument: xlsx 9 Pakete,
  exceljs 102 (80 exklusiv) — der Aufräum-Kandidat wäre exceljs, nicht xlsx.
* **Verifikation**: Entscheidung samt Zahlen im Kommentar von #174; Umsetzung offen.

## 2026-11-15 — Dependabot konfiguriert, 42 stale Alerts geschlossen (#109)

* **Creation**: `.github/dependabot.yml` — npm + docker, wöchentlich (Mo 06:00
  Wien), `target-branch: dev`, Minor/Patch gebündelt, Majors ignoriert,
  `exceljs`/`xlsx` ausgenommen.
* **Update**: `STATE.md` (Dependabot-Posten von „Pending" nach „Completed"),
  `HANDOFF.md` (Aufgabe 21 entfällt), `DECISIONS.md` (Entscheidung 2026-11-15),
  `ARCHITECTURE.md` (Abschnitt Dependency-Pflege), `package-lock.json`
  (`@typescript-eslint` 8.72.1 → 8.72.2, dev-only).
* **Reason**: Es gab keine Dependabot-Konfiguration — der Scanner meldete 42
  Alerts, ohne je einen PR zu öffnen. Alle 42 waren stale (26 × `next` gegen
  `<= 15.5.27` bei installiertem 16.4.3 usw.), einzeln per node-semver gegen das
  Lockfile geprüft und mit Grund `inaccurate` dismissed.
* **Verifikation**: GitHubs Schema-Check für `dependabot.yml` grün; Alerts
  **0 offen / 42 dismissed**; `npm audit` 13 (0 critical, 4 high → #174);
  Gate: lint 0 Fehler, typecheck, 370 Tests.

## 2026-11-15 — Release, Post-Cutover-Backup repariert, Dev-Reseed (#204)

* **Update**: `HANDOFF.md` (neuer Stand-Block; vier überholte Aussagen korrigiert:
  Dev-Startzustand für Phase 1b, „dev-restore scheitert an jedem Prod-Archiv",
  doppeltes „Nächster Schritt: Phase 1b", `QUERY_DATABASE_URL` als offen),
  `STATE.md` (Stand-Block + Relativierung des #212-Bullets), `PITFALLS.md`
  (gelöschte Tabelle = kein Backup).
* **Creation**: `deploy/prod/backup/backup.sh` zählt `Imports` statt `Uploads`
  (#216); README-Zeile nachgezogen.
* **Reason**: Der erste Backup-Lauf nach dem Cutover starb nach 2 s an der
  gedroppten Tabelle `Uploads` — Produktion war seit dem Cutover ohne Backup,
  der 02:30-Timer wäre genauso gescheitert. Nachweis ist der reale Lauf
  (`Result=success`, 13 s, Offsite-Upload 19 110 104 Bytes).
* **Verifikation**: Prod-Deploy `9eefb21` grün (Health 200, 0 offene
  Migrationen); Backup-Satz `20261115T124937Z` gegen `sha256sum -c` auf `claw`
  geprüft; Dev-Reseed `EXIT=0`, Zählwerte identisch, `clx_readonly` auf vier
  Tabellen, `clx_prev` weg, App 200; Restore-Probe auf Prod (`catchlogx-backup
  probe`) grün in 1 s; `okf-check` 8 Concepts, nur die bekannten Host-Tag-Warnungen.
* **Offen (HANDOFF 19/20)**: `deploy-dev.yml` feuert auch auf `master`-Pushes
  (Run 43716280746, `head_branch: master` trotz `branches: [dev]`);
  `P2010`/`42601` aus der SQL-Seite im Prod-Journal (11:45 UTC) ohne bekannte
  Herkunft.

## 2026-11-14 — Fischarten-Verwaltung im Admin-Panel (#201) und schnelleres Lint-Gate (#195)

* **Creation**: `services/fishSpeciesService.ts`, `app/api/admin/fish-species/`
  (GET/POST, PATCH/DELETE), `lib/fish-species-client.ts`,
  `components/AdminFishSpeciesManager.tsx` — Arten anlegen, umbenennen,
  löschen; Löschen wird bei vorhandenen Fängen mit 409 und Fangzahl
  abgelehnt. `lib/fish-species-client.ts` heißt bewusst **nicht**
  `lib/fish-species.ts`: das kollidiert auf macOS/Windows mit
  `lib/fishSpecies.ts` (#183).
* **Update**: `prisma/schema.prisma` (`FishCatch.species` explizit
  `onDelete: Restrict`, nachgewiesen migrationsfrei per `prisma migrate diff`),
  `ARCHITECTURE.md` (Komponente/Service/Client ergänzt), `STATE.md`,
  `HANDOFF.md` (#201 erledigt, #202 als nächster Schritt), `DECISIONS.md`
  (harte Löschung ohne Tombstone), `eslint.config.mjs` + `package.json`
  (`.claude/**` ignoriert, `--cache`).
* **Reason**: Die strittigen Artnamen (id 44, 85, Rutilus-Dublette) müssen vor
  dem Cutover eingeloggt in der App geklärt werden, nicht per
  Excel-Roundtrip. Server-seitig normalisiert `cleanSpeciesName` zusätzlich
  U+00A0, damit ein direkter API-Aufruf die Near-Duplikate aus #80 nicht neu
  anlegen kann.
* **Verifikation**: 25 Dateien / 346 Tests, Lint 0 Fehler / 12 Warnungen,
  Typecheck sauber; `prisma migrate diff` → „This is an empty migration.",
  `prisma generate` grün. Lint-Gate: 6,29 s kalt, 1,75 s warm (vorher ~16 s).
  **Offen:** die React-Komponente hat keinen Unit-Test (kein jsdom im
  Projekt) und wurde nicht im Browser durchgeklickt.

## 2026-11-14 — Cutover statt Migration, Epic #200 mit sechs Untersissues

* **Creation**: `deploy/prod/cutover/README.md` — Runbook-Gerüst mit
  Entscheidung, Input-Menge (13 Dateien / 183 855 Zeilen), Validierungsstand,
  Phase 0 (Blob-Export, read-only), Phase 1 (Dev-Trockenlauf), Phase 2
  (Prod-Fenster), Verifikation, Rollback, Ankündigung. Unverifizierte Schritte
  sind als `TODO (#204)` markiert.
* **Update**: `DECISIONS.md` (Cutover-Entscheidung, ids neu, M geparkt),
  `STATE.md` (Epic + Untersissues, beantwortete 38k-Lücke), `HANDOFF.md`
  (Reihenfolge der nächsten Schritte; P4/P5 aus #198 als ersetzt markiert).
* **Reason**: Die Prod-DB hat keine Herkunft (kein `importId`, kein
  `Imports`-Modell, kein Unique-Key auf `samplings`), deshalb ist ein
  Import-Löschen heute nicht möglich und ein Re-Import nicht wiederholbar.
  Neuaufbau statt Migration macht die Herkunft per Konstruktion wahr.
* **Verifikation**: Zahlen gegen die 19 Dateien im -data-Repo geprüft
  (Summe 426 251 Zeilen, `should_work` 13 = 183 855, M = 63 385, Legacy 5 =
  178 011); Validator-Lauf gegen `2026_M_final.xlsx` (1 638 ×
  `site_name` fehlt); Arten-Abgleich gegen `assets/species.json` (6 Strings,
  davon 3 NBSP/`(hybrid)`); PIT-Dublettenprüfung über alle 19 Dateien (0).
  Kein Code geändert, Gate nicht nötig.

## 2026-11-14 — GUI-Sprache: deutsche Reststrings entfernt (#199)

* **Update**: 24 deutsche Strings in sechs Dateien übersetzt (`app/api/query/route.ts`,
  `app/api/query/save/route.ts`, `components/SqlQueryComponent.tsx`,
  `components/MyUploadsPageComponent.tsx`, `components/MapComponent.tsx`,
  `app/api/admin/fetch-all/route.ts`), darunter der 403-Text, der der
  Forschungsgruppe die Whitelist erklärt, und das Spaltenlabel
  `"Ø Länge (mm)"` im Detail-Preset (→ `"Avg Length (mm)"`).
* **Reason**: `CONVENTIONS.md`/`AGENTS.md` sagen „UI text: English"; der
  Befund fiel beim Entwurf der Lösch-/Download-Dialoge für #184 auf
  (Observed-Drift-Regel: im selben Zug beheben oder festhalten).
* **Verifikation**: Umlaut-/Stichwort-Scan über `app/`, `components/`,
  `services/`, `lib/` leer; kein Test prüft die Strings; Gate grün.

## 2026-11-14 — Basisdaten-Cutover, Seed-Guard, `scripts/` nach Risikoklasse (#198)

* **Creation**: `lib/seedGuard.ts` + `lib/seedGuard.test.ts` (21 Tests:
  Entscheidungsmatrix, Ziel-Leser mit gemocktem Prisma, statischer Import-Check
  über `scripts/demo/`).
* **Update**: `scripts/` in `demo/`, `data/`, `prod/`, `ops/`; 15 Dateien per
  `git mv`, Referenzen in `package.json`, beiden Compose-Dateien, beiden
  Deploy-Workflows, `AGENTS.md`, `README.md`, `deploy/prod/postgres/README.md`
  und `docs/ai/*`. Fünf relative Importe hätten den Move nicht überlebt und
  stehen jetzt auf `@/*`; der tote `scripts/create-user.mjs`-Eintrag in
  `tsconfig.json` ist entfernt.
* **Update**: `docker-compose.yml` seedet nicht mehr; `npm run db:init` ist der
  Einstieg, der Demo-Seed einmal pro Datenbank.
* **Decision**: `DECISIONS.md` 2026-11-14 (Definition, mechanisches Kriterium,
  Cutover-Daten, Grenze des Guards, Befund zum Excel-Archiv); `PITFALLS.md`
  mit den vier Fallen (Dev ist Prod-Klon, Compose seedet nicht mehr, Guard
  erkennt Prod nicht, `wipe-fish` scheitert an `ON DELETE RESTRICT`).
* **Verifikation**: Wegwerf-Postgres (`:5433`) — `db:init` grün, zweiter Seed
  Exit 1, `wipe-fish` ohne/mit falscher Freigabe Exit 1 und mit `think/clx`
  grün, `wipe-and-seed` wischt und seedet. Pre-Push-Gate grün (23 Dateien,
  302 Tests).

## 2026-11-14 — docs/ai als OKF-v0.2-Bundle (#196)

* **Migration**: alle acht Konzeptdateien mit dem OKF-Envelope versehen
  (`type`, `title`, `description`, `tags`, `generated`, `status`); Body
  unverändert. Kein `verified` — eine Migration ist keine Verifikation.
* **Creation**: [index.md](index.md) als Einstiegspunkt, [log.md](log.md) als
  Chronik.
* **Update**: `.opencode/skills/knowledge-persistence/` von
  `opencode-helpers@547b70f` (2026-10-31) auf `b32d0f2` (2026-11-11) gehoben:
  `SKILL.md` 227 → 486 Zeilen, `FILE-TEMPLATES.md` 194 → 615, `OKF-SPEC.md`
  (774 Zeilen) neu. Die vendored Kopie war die einzige OKF-freie Stelle im
  Repo — sie enthielt keinen Treffer für „OKF", während der globale Symlink
  längst die OKF-Version lieferte.
* **Verifikation**: jede Datei beginnt mit einem parsebaren Frontmatter-Block
  mit nicht-leerem `type`; `index.md` trägt `okf_version: "0.2"`.
