# Persistenz-Log

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
