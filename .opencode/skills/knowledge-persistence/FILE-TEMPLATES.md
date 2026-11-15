# File Templates and Content Rules

Every knowledge file in `docs/ai/` is an OKF v0.2 **concept document**
(see [OKF-SPEC.md](./OKF-SPEC.md), §4): YAML frontmatter plus a markdown
body. `log.md` (§9) and `index.md` (§8) are reserved filenames and carry
no (or only `okf_version`) frontmatter.

## Frontmatter Envelope (required by this skill)

Every template below opens with this envelope; per-file types are given
in each section. The `type` attribute is the only OKF-required key,
but this skill mandates the full envelope when a file is (re)written:

```yaml
---
type: <Concept type>       # REQUIRED by OKF (see per-file types below)
title: <File title>        # human-readable display name
description: <one-line summary>
tags: [<tag>, ...]         # e.g. [ki-kustodiat, infrastructure]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable             # draft | stable | deprecated
sources:                   # when a GitHub issue is the provenance
  - id: issue-<N>
    resource: <issue URL>
    title: <issue title, short>
---
```

Envelope rules:

- `generated`: update `generated.at` on EVERY persistence run that edits
  the file. `by` uses the OKF actor convention (OKF-SPEC.md §7).
- `verified`: set by this skill when the agent confirmed an entry against
  the current codebase (machine-confirmed trust tier). Upgrade to
  human-reviewed only by human append (`by: human:<id>`). Omit it for
  files that merely restate session state (STATE.md, HANDOFF.md,
  chroniken) or for knowledge that was moved rather than re-checked —
  a relocated fact is not a verified fact.
- `status`: `stable` unless the whole file is retired. The per-entry
  lifecycle convention (`[ACTIVE until #NNN]`, relocation to HISTORY.md)
  operates at entry level, not file level. Mark a whole file
  `status: deprecated` only when every entry in it is no longer active.
- `stale_after` (OKF-SPEC.md §5.5): optional; set it only for files with a
  known deadline (e.g. a STATE focus expected to change within a week).
- Legacy files without frontmatter are tolerated (OKF conformance is
  permissive, §11) but MUST be migrated the next time the skill touches
  them. Migration means: prepend the envelope, keep the body intact.
- Known content still in force after a superseded entry is removed keeps
  its existing frontmatter; only `generated.at` gets bumped.

## Concept Boundaries and Splitting

OKF sets NO size limits — conformance (OKF-SPEC.md §11) only checks
frontmatter and reserved filenames. The rules below derive from the
spec's own signals (§2 one concept = one unit, §4.2 structured bodies,
§6 links, §8 progressive disclosure, §10.1 "split when trust state
differs") and are the house rule for this skill.

**Host/topic split comes first** (before any other boundary test):

- The entry names exactly one host → `hosts/<host>/<thema>.md`. One
  host never owns two bundles for the same theme.
- Several hosts described as one subsystem → `topics/<thema>.md`; a
  topic file is not a container for per-host trivia.
- Date-stamped narrative → `hosts/<host>/chronik.md` only. Chronik
  entries are never split, merged or pruned — they are history.
- Fleet-wide rule/decision/pitfall → global category file. A globally
  valid rule does not become a host file because it was discovered on
  one host.

**Split an entry into its own concept file when ANY of these holds:**

- The entry needs its own `status` / `stale_after` / `verified` /
  `sources` (the spec's only hard splitting rule, §10.1: revenue,
  profit and margin each verify independently — three concepts, not
  three entries in one frontmatter).
- The entry must be linkable on its own ("see the pitfall about X",
  not "see PITFALLS.md somewhere").
- The file carries more than 2–3 independent themes with their own
  lifespans.
- Soft trigger for bootstrap-loaded files: beyond ~700 lines or
  ~30 KB, split along concept axes.

**Keep entries together when:**

- the file narrates and links other concepts (STATE, HANDOFF,
  ARCHITECTURE — the §10.4/Appendix A pattern: the overview stays one
  readable concept and links the details);
- the entries share trust state and are read as one unit (grouped
  bullets of one topic, e.g. convention rules of a single domain).

**Never split by size or arbitrary chunks.** A split mid-thought
yields two concepts worth less than the original and breaks links.

**When splitting:**

- New concept IDs stay meaningful: `<topic>/<slug>.md` in a
  subdirectory with its own `index.md` (OKF §3, §8).
- The original file keeps an overview section linking the new
  concepts (do not leave a stub without pointers).
- `log.md` records the move (**Creation** for each new concept,
  **Update** for the original).
- The Confirmation step (SKILL.md step 9) lists every split
  explicitly — a split is never silent.
- A split performed in a legacy repo migrates only the moved entries;
  unrelated legacy files stay untouched until their own next touch.

## Host and Topic Bundles (`hosts/`, `topics/`)

Placement is decided before writing (SKILL.md step 3): exactly one host
→ `hosts/<host>/<thema>.md`; several hosts as one subsystem →
`topics/<thema>.md`; fleet-wide → global category file; dated narrative
→ `hosts/<host>/chronik.md`. If it is unclear, the entry stays in the
global file tagged `tags: [host:…]`.

| Content | File | Frontmatter `type` |
|---|---|---|
| One host, one theme (≥2 entries) | `hosts/<host>/<thema>.md` | `Host Topic` |
| Several hosts, one subsystem | `topics/<thema>.md` | `Topic` |
| Dated session/ops narrative | `hosts/<host>/chronik.md` | `Host Chronik` |
| Fleet-wide rule/decision/pitfall | global category file | see above |
| Directory entry point | `index.md` (any level) | none (reserved) |

Section headings in these files are **literal German** (`# Überblick`,
`# Betrieb`, `# Fallstricke`, `# Entscheidungen`) because this fleet's
bundle body language is German; a bundle written in another language
translates the four headings once and uses them consistently. The
frontmatter and this skill stay English. A section is omitted when it
would be empty — but never reordered.

### `hosts/<host>/index.md` (reserved index)

No frontmatter (only the bundle root carries `okf_version`). Header
block with the host's fixed facts, then a link list of the host's
concept files. Regenerated by step 5b; themed entries never live here —
the only body beyond the link list is the host-wide decisions section.

```markdown
# <host>

<one-line role of this host>

- **Rolle:** <web/mail/vpn/…>
- **OS:** <distribution, release, patch state>
- **IP:** <public / vpn / lan>
- **Dienste:** <the services that matter>
- **Zugang:** <ssh path, jump host, knock requirement>
- **Besonderheit:** <the one thing a fresh agent must know>

## Konzepte

* [chronik.md](chronik.md) - Datierte Sitzungs- und Betriebschronik (neueste oben).
* [<thema>.md](<thema>.md) - <one-line description>

# Entscheidungen

## YYYY-MM-DD (<host>): <title>
- **Entscheid**: <choice that concerns the host as a whole>
- **Konsequenz**: <what follows for future sessions>
```

Host-wide decisions live in this index only while they concern the host
as a whole; theme-bound decisions go into the theme file's
`# Entscheidungen` section.

### Host topic file (`hosts/<host>/<thema>.md`)

`type: Host Topic`, mandatory `host:` key, tags start with
`host:<host>`. The body answers: what is it (`# Überblick`), how is it
operated (`# Betrieb`), what breaks (`# Fallstricke`), what was decided
(`# Entscheidungen`).

```markdown
---
type: Host Topic
title: <host> — <Thema>
description: <one-line summary, names the host's concrete stack>
tags: [host:<host>, <thema>]
host: <host>
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable
---
# Überblick
<what this theme is on this host, two or three sentences>

# Betrieb
<commands, paths, config files, cron entries — the operational truth>

# Fallstricke
- <what breaks here and how to recognise it>

# Entscheidungen
## YYYY-MM-DD (<host>): <title>
- **Entscheid**: <choice>
- **Begründung**: <reason>
- **Verworfen**: <alternatives>
```

Moved/migrated text carries **no `verified`** — see SKILL.md, step 3.

### `topics/<thema>.md`

`type: Topic`, tags `[topic, <thema>]`, **no** `host:` key — the file
exists because the thing spans hosts. Every statement names its host
explicitly; a topic file that quietly describes one host belongs in
that host's bundle instead.

```markdown
---
type: Topic
title: <Thema> (mehrere Hosts)
description: <one-line summary naming the participating hosts>
tags: [topic, <thema>]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable
---
# Überblick
<which hosts participate and how they form one subsystem>

# Betrieb
<per-host roles, endpoints, ports, config paths>

# Fallstricke
- <cross-host failure modes, drift patterns>

# Entscheidungen
## YYYY-MM-DD (<hostA>/<hostB>): <title>
- **Entscheid**: <choice>
- **Begründung**: <reason>
```

### `hosts/<host>/chronik.md`

`type: Host Chronik`, append-only, newest entry on top. This is the
only place for dated session narrative — no pruning, no rewriting, no
relocation to HISTORY.md. A correction is a new entry that names the
corrected one.

```markdown
---
type: Host Chronik
title: <host> — Chronik
description: Datierte Sitzungs- und Betriebschronik von <host>.
tags: [host:<host>, chronik]
host: <host>
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable
---

# Chronik

## YYYY-MM-DD (<host>): <title>
- **Ausgangslage:** <state before>
- **Eingriff:** <what was done, with commands/paths>
- **Ergebnis:** <measured outcome>
- **Offen:** <what remains, or "nichts">
```

## DECISIONS.md

Records ACTIVE architectural and technical decisions — one-time
choices still in force. Superseded decisions are relocated to
HISTORY.md. Each entry must have a date, a title, and a reason.

```markdown
---
type: Decisions
title: Decisions
description: Active architectural and technical decisions still in force.
tags: [knowledge, decisions]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# Decisions

Active architectural and technical decisions still in force.
Superseded decisions are relocated to HISTORY.md.

## YYYY-MM-DD: <Short Title>
- **Choice**: What was chosen
- **Reason**: Why this option was selected
- **Considered**: What alternatives were evaluated
- **Tradeoff**: Known downsides accepted
```

## CONVENTIONS.md

Records coding patterns, naming rules, file layout, and style
agreements that the agent must follow without re-discovering them.
Entries are terse, imperative, and grouped by topic.

```markdown
---
type: Conventions
title: Conventions
description: Coding patterns, naming rules, and style agreements to follow.
tags: [knowledge, conventions]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# Conventions

Coding patterns, naming rules, and style agreements for this project.
Follow these without question. Do not deviate unless explicitly told.

## Naming
- <rule>

## File Layout
- <rule>

## API Patterns
- <rule>

## Database
- <rule>

## Testing
- <rule>
```

## PITFALLS.md

Records hard-won knowledge: things that failed, subtle bugs,
ordering issues, and non-obvious constraints. The purpose is to
prevent a new agent from repeating mistakes.

**What stays vs what moves to HISTORY.md:**
- Permanent non-obvious constraints (invariants, platform quirks,
  validation rules) → stays here.
- Bugs that were fixed, workarounds since removed, regressions
  since patched → moves to HISTORY.md once the fix ships.

```markdown
---
type: Pitfalls
title: Pitfalls
description: Hard-won knowledge about what does not work and non-obvious constraints.
tags: [knowledge, pitfalls]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# Pitfalls

Things that do not work, subtle bugs, and non-obvious constraints.
Read this file carefully before making changes in affected areas.

- <pitfall description, one line, actionable>
```

## HISTORY.md

Chronological archive of superseded decisions and entries pruned
from active files. This file is append-only; never delete entries.
Superseded entries are EXPECTED here — this is the full audit trail.

Note: HISTORY.md is NOT the OKF `log.md` (reserved filename, §9) — it
is an ordinary concept document that keeps the SUPERSEDED audit-trail
format below. The OKF `log.md` is the per-run persistence log described
in its own section further down.

```markdown
---
type: History Archive
title: History
description: Append-only archive of superseded decisions and pruned entries.
tags: [knowledge, history, audit]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# History

Chronological archive of superseded decisions and pruned entries.
Entries here are no longer active truth. Never delete from this file.

## YYYY-MM-DD (SUPERSEDED YYYY-MM-DD, origin: <FILE>, reason: <why or #NNN>): <Title>
- <original entry text>
- **Origin**: <source file>
- **Reason**: <why it was superseded or pruned>
```

## DOMAIN.md

Records business logic, domain rules, and relationships that are
not obvious from the code alone. Only populate this file when the
project has meaningful domain logic.

```markdown
---
type: Domain Notes
title: Domain Knowledge
description: Business rules and domain relationships not obvious from code.
tags: [knowledge, domain]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# Domain Knowledge

Business rules and domain relationships not obvious from code.

## Entities
- <entity>: <short description and key constraints>

## Rules
- <business rule, one line>
```

## STATE.md

Records the current project/fleet status. This is the most volatile
file. It is overwritten (not appended) on every persistence run and
holds **status, not narrative**: dated stories live in the host
chroniken, STATE only links them.

```markdown
---
type: State
title: <Fleet> Status
description: Current fleet status and pointers to the host chroniken.
tags: [knowledge, state]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable
---

# <Fleet> Status

Current state as of YYYY-MM-DD. Narratives live in the host chroniken.

## Current
* **<host>** — <one line: what runs, what is open>. [Chronik](hosts/<host>/chronik.md)

## Open Threads

### <host> — [Chronik](hosts/<host>/chronik.md)
- [ ] <task>

### Fleet
- [ ] <cross-host task, links topics/<thema>.md>
```

## HANDOFF.md

Records open tasks for the next session. Overwritten on every
persistence run. **Open tasks only** — no narrative, no completed work.
Every task names its host and links the host bundle (or the topic file
for cross-host work).

```markdown
---
type: Handoff
title: Handoff
description: Open tasks for the next agent session.
tags: [knowledge, handoff]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
status: stable
---

# Handoff

## Open Tasks
1. [ ] <host>: <task with file paths and issue references> — [host bundle](hosts/<host>/index.md)
2. [ ] Flotte: <cross-host task> — [topic](topics/<thema>.md)

## Current Branch
<main>
```

## ARCHITECTURE.md

Living structural map of the system. Overwritten on every persistence
run when structural changes occurred. If nothing structural changed,
the file is left untouched (= frontmatter stays valid, only a body
change would require a `generated.at` bump).

```markdown
---
type: Architecture
title: Architecture
description: Living structural map of the system.
tags: [knowledge, architecture]
generated: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
verified: { by: opencode/knowledge-persistence, at: <ISO 8601 UTC datetime> }
---

# Architecture

Living structural map of the system as of YYYY-MM-DD.
Overwritten when structural changes occur during a session.

## Overview
<one-paragraph description of what this system is and how it is organized>

## Commands (`commands/`)
| Command | Purpose | Delegates to |
|---------|---------|-------------|
| `/name`  | <what it does> | `skills/<name>` or "none" |

## Skills (`skills/`)
| Skill | Purpose | Used by |
|-------|---------|---------|
| `name` | <what it does> | `/<command>` |

## Knowledge Files (`docs/ai/`)
| File | OKF type | Purpose | Update mode |
|------|----------|---------|------------|
| `index.md` | — (reserved) | Bundle entry point, `okf_version: "0.2"` | Regenerate |
| `log.md` | — (reserved) | Per-run persistence log | Append, newest first |
| HANDOFF.md | Handoff | Open tasks for next session (host-tagged) | Overwrite |
| DECISIONS.md | Decisions | Fleet-wide decisions still in force | Append; prune superseded → HISTORY.md |
| ARCHITECTURE.md | Architecture | Living structural map | Overwrite |
| CONVENTIONS.md | Conventions | Fleet-wide rules to follow | Append |
| PITFALLS.md | Pitfalls | Fleet-wide hard-won failure knowledge | Append |
| DOMAIN.md | Domain Notes | Business/domain rules | Append |
| STATE.md | State | Short fleet status + chronik links | Overwrite |
| HISTORY.md | History Archive | Superseded entries archive (one file) | Append-only |
| `hosts/index.md` | — (reserved) | Host bundles + their chroniken | Regenerate |
| `hosts/<host>/index.md` | — (reserved) | Host facts, concepts, host decisions | Regenerate |
| `hosts/<host>/<thema>.md` | Host Topic | One host, one theme | Append; prune superseded → HISTORY.md |
| `hosts/<host>/chronik.md` | Host Chronik | Dated session/ops narrative | Append-only, newest on top |
| `topics/index.md` | — (reserved) | Host-crossing subsystems | Regenerate |
| `topics/<thema>.md` | Topic | Several hosts as one subsystem | Append; prune superseded → HISTORY.md |

## Data Flows
- <source> → <target>: <what flows and when>
```

## `docs/ai/log.md` (OKF reserved filename, §9)

Per-run persistence log, newest first, date-grouped. Appended at the
end of every persistence run. NO frontmatter (OKF §9 forbids it).

```markdown
# Persistence Log

## YYYY-MM-DD
* **Update**: Regenerated [STATE.md](STATE.md) and [HANDOFF.md](HANDOFF.md).
* **Update**: Added 1 entry to [PITFALLS.md](PITFALLS.md).
* **Deprecation**: Moved one superseded CONVENTIONS entry to [HISTORY.md](HISTORY.md).

## YYYY-MM-DD (earlier)
* ...
```

## `docs/ai/index.md` (OKF reserved filename, §8)

Progressive-disclosure entry point, regenerated by every persistence
run. No frontmatter except the bundle-root `okf_version` declaration.

```markdown
---
okf_version: "0.2"
---

# Knowledge Bundle Index

Short pointers; open individual concept files for details. Files
without frontmatter are legacy-but-tolerated and migrate on next touch.

## Active Files
* [HANDOFF.md](HANDOFF.md) - Open tasks for the next session (host-tagged)
* [STATE.md](STATE.md) - Short fleet status with links to the chroniken
* [CONVENTIONS.md](CONVENTIONS.md) - Fleet-wide rules to follow
* [DECISIONS.md](DECISIONS.md) - Fleet-wide decisions still in force
* [ARCHITECTURE.md](ARCHITECTURE.md) - Living structural map
* [PITFALLS.md](PITFALLS.md) - Fleet-wide hard-won failure knowledge
* [DOMAIN.md](DOMAIN.md) - Business/domain rules

## Directories
* [hosts/](hosts/index.md) - Host bundles: one directory per host, each with `index.md` and `chronik.md`
* [topics/](topics/index.md) - Host-crossing subsystems (bots, VPN, search, config tracking)

## Reference
* [HISTORY.md](HISTORY.md) - Superseded-entries archive (append-only, one file)
* [log.md](log.md) - Per-run persistence log
```

## AGENTS.md Bootstrap Block

Ensure this block exists in the project's `AGENTS.md`. If `AGENTS.md`
does not exist, create it with this content. If it exists, append this
block only if it is not already present.

```markdown
## Knowledge Bootstrap
Before starting any task, read the knowledge entry point first:
0. `docs/ai/index.md` (OKF index; if missing, fall back to the file
   list below) ← **start here**
   If the task concerns a specific host, also read
   `docs/ai/hosts/<host>/index.md` and the concept files it links;
   cross-host subsystems are in `docs/ai/topics/`.

Then, in order (skip files the index says are absent):
1. `docs/ai/HANDOFF.md` ← **read first, act on it**
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/ARCHITECTURE.md`
5. `docs/ai/PITFALLS.md`
6. `docs/ai/STATE.md`
7. `docs/ai/DOMAIN.md` (if task involves business logic)
8. `docs/ai/HISTORY.md` (reference only — read last, as needed)

Knowledge files follow the Open Knowledge Format v0.2 (see
`skills/knowledge-persistence/OKF-SPEC.md` in opencode-helpers when
editing): each has YAML frontmatter with `type` and trust fields.
Legacy files without frontmatter are tolerated but migrate on next
persistence run.

If `HANDOFF.md` contains open tasks, complete them before starting
any new work unless the user explicitly says otherwise.
```
