# File Templates and Content Rules

## DECISIONS.md

Records ACTIVE architectural and technical decisions — one-time
choices still in force. Superseded decisions are relocated to
HISTORY.md. Each entry must have a date, a title, and a reason.

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

## CONVENTIONS.md

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
# Pitfalls

Things that do not work, subtle bugs, and non-obvious constraints.
Read this file carefully before making changes in affected areas.

- <pitfall description, one line, actionable>
```

## HISTORY.md

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

## DOMAIN.md

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

## STATE.md

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

## ARCHITECTURE.md

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
