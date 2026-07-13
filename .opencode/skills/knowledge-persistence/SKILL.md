---
name: knowledge-persistence
description: Persist session context into the structured docs/ai knowledge files
license: MIT
compatibility: opencode
metadata:
  category: workflow
  scope: documentation
---

# Knowledge Persistence Skill

## Purpose

This skill extracts the agent's accumulated understanding from the current
session and persists it into a structured set of knowledge files on disk.
Use this skill at any checkpoint during or at the end of a productive
session, or when explicitly asked to "save context", "persist knowledge",
or "update knowledge file".

## Target Structure

Ensure the following directory and files exist relative to the project root.
Create any missing files. Never delete entries from HISTORY.md (it is
an append-only archive). Do delete superseded entries from active files
by relocating them to HISTORY.md.

```text
docs/ai/
├── HANDOFF.md
├── DECISIONS.md
├── ARCHITECTURE.md
├── CONVENTIONS.md
├── PITFALLS.md
├── DOMAIN.md
├── STATE.md
└── HISTORY.md
```

**Active files** (must match current HEAD; no superseded entries):
HANDOFF.md, DECISIONS.md, ARCHITECTURE.md, CONVENTIONS.md, PITFALLS.md,
DOMAIN.md, STATE.md.

**Historical file** (chronological sink; superseded entries EXPECTED here):
HISTORY.md.

## Protocol

### 1. Discovery

- Read all existing files in `docs/ai/` to understand what is
  already persisted.
- If the directory does not exist, create it.
- If a file does not exist, create it with the template provided below.

### 2. Diff Against Session

- Review the full conversation history of the current session.
- For each knowledge file, identify facts, decisions, patterns, or status
  changes that emerged during this session and are NOT yet in the file.
- Ignore transient chatter, failed attempts that were fully superseded,
  and speculative discussion that did not lead to a conclusion.

### 3. Write Updates

- Append new entries to the appropriate file.
- If an existing entry is now outdated, MOVE it to HISTORY.md (do not
  leave superseded content in active files).
- Never duplicate an entry that already exists.
- Write only facts. One item per bullet. No preamble, no commentary,
  no summaries at the top of the file.

### 3b. Prune Superseded Entries

For each active file being updated, scan for entries that no longer
match current reality:

- Entries contradicted by current code or configuration.
- Entries superseded by a later decision or implementation.
- Entries describing a reverted or removed change.

For each superseded entry found:

1. **Remove** it from the active file.
2. **Append** it to `HISTORY.md` with a header:
   `## YYYY-MM-DD (SUPERSEDED YYYY-MM-DD, origin: <FILE>, reason: <why or #NNN>): <Title>`
3. Include the original entry text below the header, plus one line
   noting the origin file and the reason it was superseded.
4. Leave a ONE-LINE pointer in the active file ONLY if a future reader
   would otherwise re-discover the same pitfall; otherwise delete
   cleanly.

**PITFALLS.md special case**: Distinguish between:
- **(a) Permanent non-obvious constraints** (e.g., "Room validates
  PRAGMA table_info, PK must be NOT NULL") — these stay in active
  PITFALLS.md.
- **(b) Bugs that were fixed** (e.g., "clearText+typeText race, fixed
  in #254") — these MOVE to HISTORY.md once the fix ships. Their value
  is historical, not advisory.

**Status-tag convention**: For active-file entries with a known
lifecycle (e.g., a workaround slated for removal), append an optional
trailing tag `[ACTIVE until #NNN]` so a future pruner knows to
relocate it.

### 4. Rewrite `ARCHITECTURE.md` (if structural changes occurred)

- Determine whether the session introduced any structural changes:
  new/removed/renamed commands, skills, knowledge files, or significant
  changes to data flows, dependencies, or component relationships.
- If no structural changes occurred, skip this step and leave
  `ARCHITECTURE.md` unchanged.
- If structural changes did occur, **overwrite** `docs/ai/ARCHITECTURE.md`
  with the current system snapshot using the template below.
- Like STATE.md, this file is overwritten (not appended) because it
  represents a point-in-time structural map, not a chronological log.

### 5. Write `HANDOFF.md`

- Check the task list maintained during this session.
- If any tasks are still [PENDING] or [IN PROGRESS], write them to
  `docs/ai/HANDOFF.md` using the template below.
- Include: the current branch, each open task with file paths and
  line numbers where applicable, and any context the next agent
  needs to avoid re-discovery.
- If all tasks are complete, clear the file body and write only:
  `No pending tasks. Last cleared: YYYY-MM-DD.`

#### Escalation Rule

- If an open task would require more than ~30 minutes of agent work,
  do NOT put it in HANDOFF.md alone.
- Create a GitHub issue: `gh issue create --title "<title>" --body "<body>"`
- In HANDOFF.md, reference only the issue number:
  `1. [ ] See #42 — Refactor enrollment module to cursor pagination`
- This keeps HANDOFF.md small and actionable while large work is
  properly tracked in GitHub.

### 6. Update `AGENTS.md`

- Ensure the project-level `AGENTS.md` (in project root or `.opencode/`)
  contains the bootstrap instruction block. If it does not, append it.

### 7. Comment on Active Issue (if applicable)

- If there is a known active GitHub issue for the current session, post a
  brief comment summarizing what knowledge was persisted (files updated,
  key additions). Example:
  `gh issue comment 42 --body "Knowledge persisted: added 3 entries to CONVENTIONS.md, updated STATE.md."`
- **NEVER close, reopen, or change the state of any issue.** This skill
  only adds comments for traceability.
- If no active issue is known, skip this step silently.

### 8. Confirmation

- After writing, list every file that was created or modified, and for each
  show the number of entries added, updated, or removed.

## File Templates and Content Rules

### DECISIONS.md

Records ACTIVE architectural and technical decisions — one-time
choices still in force. Superseded decisions are relocated to
HISTORY.md. Each entry must have a date, a title, and a reason.

> **Option B (alternative)**: Fold DECISIONS.md into HISTORY.md
> entirely (single historical file). Simpler but loses the
> "active decisions" vs "historical record" distinction. To adopt
> Option B, remove this template and route all decisions to
> HISTORY.md instead.

```markdown
# Decisions

Active architectural and technical decisions still in force.
Superseded decisions are relocated to HISTORY.md.

## YYYY-MM-DD: <Short Title>
- **Choice**: What was chosen
- **Reason**: Why this option was selected
- **Considered**: What alternatives were evaluated
- **Tradeoff**: Known downsides accepted
```

### CONVENTIONS.md

Records coding patterns, naming rules, file layout, and style
agreements that the agent must follow without re-discovering them.
Entries are terse, imperative, and grouped by topic.

```markdown
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

### PITFALLS.md

Records hard-won knowledge: things that failed, subtle bugs,
ordering issues, and non-obvious constraints. The purpose is to
prevent a new agent from repeating mistakes.

**What stays vs what moves to HISTORY.md:**
- Permanent non-obvious constraints (invariants, platform quirks,
  validation rules) → stays here.
- Bugs that were fixed, workarounds since removed, regressions
  since patched → moves to HISTORY.md once the fix ships.

```markdown
# Pitfalls

Things that do not work, subtle bugs, and non-obvious constraints.
Read this file carefully before making changes in affected areas.

- <pitfall description, one line, actionable>
```

### HISTORY.md

Chronological archive of superseded decisions and entries pruned
from active files. This file is append-only; never delete entries.
Superseded entries are EXPECTED here — this is the full audit trail.

```markdown
# History

Chronological archive of superseded decisions and pruned entries.
Entries here are no longer active truth. Never delete from this file.

## YYYY-MM-DD (SUPERSEDED YYYY-MM-DD, origin: <FILE>, reason: <why or #NNN>): <Title>
- <original entry text>
- **Origin**: <source file>
- **Reason**: <why it was superseded or pruned>
```

### DOMAIN.md

Records business logic, domain rules, and relationships that are
not obvious from the code alone. Only populate this file when the
project has meaningful domain logic.

```markdown
# Domain Knowledge

Business rules and domain relationships not obvious from code.

## Entities
- <entity>: <short description and key constraints>

## Rules
- <business rule, one line>
```

### STATE.md

Records the current project status. This is the most volatile file.
It is overwritten (not appended) on every persistence run.

```markdown
# Project State

Current status as of YYYY-MM-DD.

## Current Focus
<one-liner describing the active workstream>

## Completed (this cycle)
- [x] <task>

## Pending
- [ ] <task>

## Blockers
- <blocker or "None">

## Next Session Suggestion
<what the next agent should start with>
```

### ARCHITECTURE.md

Living structural map of the system. Overwritten on every persistence
run when structural changes occurred. If nothing structural changed,
the file is left untouched.

```markdown
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
| File | Purpose | Update mode |
|------|---------|------------|
| HANDOFF.md | Open tasks for next session | Overwrite |
| DECISIONS.md | Active decisions still in force | Append; prune superseded → HISTORY.md |
| ARCHITECTURE.md | Living structural map | Overwrite |
| CONVENTIONS.md | Ongoing rules to follow | Append |
| PITFALLS.md | Hard-won failure knowledge | Append |
| DOMAIN.md | Business/domain rules | Append |
| STATE.md | Current project status | Overwrite |
| HISTORY.md | Superseded entries archive | Append-only |

## Data Flows
- <source> → <target>: <what flows and when>
```

## AGENTS.md Bootstrap Block

Ensure this block exists in the project's `AGENTS.md`. If `AGENTS.md`
does not exist, create it with this content. If it exists, append this
block only if it is not already present.

```markdown
## Knowledge Bootstrap
Before starting any task, read the following files in order:
1. `docs/ai/HANDOFF.md` ← **read first, act on it**
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/ARCHITECTURE.md`
5. `docs/ai/PITFALLS.md`
6. `docs/ai/STATE.md`
7. `docs/ai/DOMAIN.md` (if task involves business logic)
8. `docs/ai/HISTORY.md` (reference only — read last, as needed)

If `HANDOFF.md` contains open tasks, complete them before starting
any new work unless the user explicitly says otherwise.
```

## Constraints

- Write only verified facts from the session. Do not speculate.
- Keep entries atomic: one fact, one bullet.
- Active files: merge new entries, but DELETE superseded entries by
  relocating them to HISTORY.md. Never leave stale content in active
  files.
- HISTORY.md: append-only. Never delete or modify existing entries.
- Overwrite files: STATE.md, ARCHITECTURE.md, and HANDOFF.md are
  overwritten on each persistence run (not appended).
- If unsure whether something belongs in DECISIONS vs CONVENTIONS,
  apply this test: "Is this a one-time choice (DECISIONS) or an
  ongoing rule to follow (CONVENTIONS)?"
- If unsure whether something belongs in DECISIONS vs ARCHITECTURE,
  apply this test: "Is this a chronological record of a choice
  (DECISIONS) or a structural description of the current system
  (ARCHITECTURE)?"
- If unsure whether an entry is still valid, apply this test:
  "Is this still true in the current codebase? If not, it belongs
  in HISTORY.md, not the active file."
- Active files stay lean through the prune protocol (step 3b); no
  hard line limit is needed.
- HISTORY.md is append-only and will grow over time. If it exceeds
  ~500 lines, archive entries older than 6 months into
  `HISTORY-archive.md` (also append-only, same header format).
- **Issue Safety**: This skill is a documentation-only operation. It
  must NEVER close, reopen, or change the state of any GitHub issue.
  Issue lifecycle management is the exclusive responsibility of the
  `issue-workflow` skill's `finish` mode. When invoked standalone, this
  skill may only create new issues (Escalation Rule) or comment on
  existing ones.
