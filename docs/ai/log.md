# Persistenz-Log

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
  Tabellen, `clx_prev` weg, App 200.

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
