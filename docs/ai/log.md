# Persistenz-Log

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
