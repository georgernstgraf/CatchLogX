---
name: knowledge-persistence
description: Persist session context into the structured docs/ai knowledge files
  (OKF bundle; committed and pushed at the end). Use when the user says
  "remember", "merk dir das", "save context", "persist knowledge" or "update
  knowledge file", at a session checkpoint, or when an observation in this
  session contradicts docs/ai/ or AGENTS.md. Do not use for reading the
  knowledge files at session start — that is plain bootstrapping.
license: MIT
compatibility: opencode
metadata:
  category: workflow
  scope: documentation
---

<!--
Vendored from georgernstgraf/opencode-helpers @ b32d0f2 (2026-11-11).
Synced 2026-11-14 (#196). Re-sync manually: copy SKILL.md, FILE-TEMPLATES.md
and OKF-SPEC.md over, re-apply this note, and bump the commit.
-->

# Knowledge Persistence Skill

## Purpose

This skill extracts the agent's accumulated understanding from the current
session and persists it into a structured set of knowledge files on disk.
The files follow the **Open Knowledge Format (OKF) v0.2** — the full
specification is vendored alongside this skill in
[OKF-SPEC.md](./OKF-SPEC.md).
Use this skill at any checkpoint during or at the end of a productive
session, or when explicitly asked to "save context", "persist knowledge",
or "update knowledge file".

Persisting to disk is **not** the end of the skill: **every persistence run
finishes with its own commit and push** (SVN: `svn ci`) of the updated
knowledge files, referencing the active issue. Knowledge that is written but
not committed does not exist for the next agent — the run is only complete
once the changes are on the trunk.

## Target Structure

Ensure the following directory and files exist relative to the project root.
Create any missing files. Never delete entries from HISTORY.md (it is
an append-only archive). Do delete superseded entries from active files
by relocating them to HISTORY.md. `hosts/<host>/` and `topics/` are
created lazily — only together with their first real content, never as
empty scaffolding.

`docs/ai/` is treated as an OKF **bundle**: every non-reserved `.md` file
is a concept document carrying a YAML frontmatter envelope with the
required `type` field plus the trust and lifecycle fields (see
[FILE-TEMPLATES.md](./FILE-TEMPLATES.md)). The reserved filenames
`index.md` and `log.md` carry no (or only `okf_version`) frontmatter.

```text
docs/ai/
├── index.md        (OKF §8: progressive-disclosure index, okf_version)
├── log.md          (OKF §9: per-run persistence log, date-grouped)
├── HANDOFF.md      type: Handoff        — ONLY open tasks
├── DECISIONS.md    type: Decisions      — fleet-wide decisions only
├── ARCHITECTURE.md type: Architecture   — fleet map + host table
├── CONVENTIONS.md  type: Conventions    — fleet-wide rules only
├── PITFALLS.md     type: Pitfalls       — fleet-wide pitfalls only
├── DOMAIN.md       type: Domain Notes
├── STATE.md        type: State          — short fleet status + links
├── HISTORY.md      type: History Archive — ONE file, append-only
├── hosts/
│   ├── index.md                      (reserved index, no frontmatter)
│   └── <host>/
│       ├── index.md                  (reserved index: role, OS, IPs, links)
│       ├── chronik.md                type: Host Chronik (append-only)
│       └── <thema>.md                type: Host Topic
└── topics/
    ├── index.md                      (reserved index, no frontmatter)
    └── <thema>.md                    type: Topic
```

**Scope split** (global vs. host vs. topic):

- **Global category files** (`HANDOFF`, `DECISIONS`, `ARCHITECTURE`,
  `CONVENTIONS`, `PITFALLS`, `DOMAIN`, `STATE`) hold what applies
  **across hosts**: a rule every host follows, a decision that changes
  the fleet, a structural map, a pitfall no single host owns.
- **`hosts/<host>/`** holds what names **exactly one host** — its mail
  chain, its ZFS pool, its boot quirks, its service layout.
- **`topics/<thema>.md`** holds what describes **several hosts as one
  subsystem** — Telegram bots across the fleet, the VPN mesh, a search
  stack with two instances, config tracking per host tree.
- **`hosts/<host>/chronik.md`** holds **dated session narratives** for
  that host, append-only, newest first. It is not a category file: no
  pruning, no reordering, no rewriting of past entries.

`index.md` and `log.md` stay reserved at **every** level: the bundle
root, `hosts/`, `topics/` and each `hosts/<host>/` carry an `index.md`
that is a pure link list without frontmatter (`okf_version` only in the
bundle root). `log.md` remains a single bundle-root file.

Legacy files without frontmatter are tolerated (OKF conformance is
permissive, OKF-SPEC.md §11) but MUST receive the envelope the next time
the skill touches them — no big-bang migration is required.

**Active files** (must match current HEAD; no superseded entries):
HANDOFF.md, DECISIONS.md, ARCHITECTURE.md, CONVENTIONS.md, PITFALLS.md,
DOMAIN.md, STATE.md, and every non-`index.md`/non-`log.md` concept file
under `hosts/` and `topics/`.

**Historical files** (chronological sinks; superseded entries EXPECTED
here): HISTORY.md (one file, never split, never pruned) and the
`hosts/<host>/chronik.md` narratives (append-only).

## Protocol

### 1. Discovery

- Start at `docs/ai/index.md` (OKF §8 progressive disclosure) if it
  exists; it lists what is present, including legacy files, and points
  at `hosts/index.md` and `topics/index.md`.
- If the session has a **host context** (an SSH target, a host-named
  directory, `EDV/Deployed/<host>/`, a hostname in the task), read
  `hosts/<host>/index.md` and the topic files it links before writing
  anything. Read the neighbouring host bundles only when the session
  compares hosts or the placement is unclear.
- For a **multi-host subsystem**, read `topics/index.md` and the
  matching `topics/<thema>.md`, plus the host bundles it names.
- Read all existing files in `docs/ai/` (including `hosts/` and
  `topics/` subtrees) to understand what is already persisted. Files
  WITHOUT frontmatter are legacy-but-valid; any file you end up editing
  must first receive the OKF envelope (see [FILE-TEMPLATES.md](./FILE-TEMPLATES.md),
  "Frontmatter Envelope").
- If the directory does not exist, create it (with `index.md` and
  `log.md`).
- If a file does not exist, create it with the template in
  [FILE-TEMPLATES.md](./FILE-TEMPLATES.md). A host or topic file is
  only created when it will hold **at least two entries** — a single
  fact joins the closest related topic file instead.

### 2. Diff Against Session

- Review the full conversation history of the current session.
- For each knowledge file, identify facts, decisions, patterns, or status
  changes that emerged during this session and are NOT yet in the file.
- Ignore transient chatter, failed attempts that were fully superseded,
  and speculative discussion that did not lead to a conclusion.

### 2b. Observed Drift

Drift is any observation **during** the session that contradicts a
statement in `docs/ai/` or `AGENTS.md`: a command output on a host, a file
that is not where the docs say, a documented command that returns nothing
or something else. Documented commands (in `AGENTS.md`, runbooks, skill
instructions) count as statements — if they do not do what they promise,
that is drift.

- Drift is handled **in the same session**, never left in the chat or in
  agent-private memory.
- Two outcomes, and the evidence decides which:
  - **Correct it** — the observation is conclusive, so the statement is
    fixed under the prune protocol (3b) with a reason of the form
    `observed YYYY-MM-DD on <host>: <evidence>`.
  - **Open a HANDOFF task** — the observation is real but not conclusive.
    The task names file, line and evidence. A single observation is enough
    for a task, not always for a new statement: writing a replacement
    guess would swap one wrong statement for another.
- A file carrying an observed contradiction counts as "being updated"
  for 3b, even when the session otherwise adds nothing new to it.
- Section 6 extends to **stale commands**, not just the bootstrap block:
  a documented command that fails or misreports is drift as well.
- What is *not* drift, and not worth a task: a host that has evidently
  moved on (different version, renamed unit) when the docs never claimed
  that state, and transient failures (network, rate limits) that say
  nothing about the documented behaviour.

### 3. Write Updates

**Placement rules (binding, decide before writing):**

1. The entry names **exactly one host** → `hosts/<host>/<thema>.md`
   with the sections `# Überblick`, `# Betrieb`, `# Fallstricke`,
   `# Entscheidungen` (empty sections may be omitted).
2. The entry describes **several hosts as one subsystem** →
   `topics/<thema>.md`.
3. The entry is a **fleet-wide** rule, decision, pitfall or structural
   fact → the global category file (`CONVENTIONS.md`, `DECISIONS.md`,
   `PITFALLS.md`, `ARCHITECTURE.md`, `DOMAIN.md`).
4. The entry is a **dated session narrative** ("on 2026-11-09 we
   changed X on host Y, result Z") → `hosts/<host>/chronik.md`,
   append-only, newest entry on top.
5. The entry cannot be pinned to one host and is not fleet-wide
   either → keep it in the global file and tag it, `tags: [host:…]`,
   so the next run can split it out.
6. A host or topic file is created only when it carries **at least
   two entries**; otherwise the entry goes into the related topic file
   rather than spawning a one-bullet file.

Then:

- Append new entries to the file chosen above.
- Before appending to a collection file, check the concept-boundary
  rules in [FILE-TEMPLATES.md](./FILE-TEMPLATES.md) ("Concept
  Boundaries and Splitting") — split instead of growing a file that
  mixes entries with independent lifespans.
- If an existing entry is now outdated, MOVE it to HISTORY.md (do not
  leave superseded content in active files).
- **Chronik exception:** entries in `hosts/<host>/chronik.md` are never
  moved to HISTORY.md and never edited after the fact — a correction is
  a new dated entry that names the corrected one.
- Never duplicate an entry that already exists.
- Write only facts. One item per bullet. No preamble, no commentary,
  no summaries at the top of the file.

**Frontmatter maintenance (every touched file):**

- On any edit, update `generated.at` to the current run's ISO 8601
  UTC datetime (OKF §5.2).
- When you verified an entry against the current codebase/config
  **before** writing it, set `verified: { by: opencode/knowledge-persistence, at: <ISO> }`
  (machine-confirmed trust tier, OKF §5.3). Never fabricate a
  `human:` verification — only a human may add `by: human:<id>`.
- **Moved or migrated knowledge inherits NO `verified`.** Text that was
  relocated from another file (legacy flat file → host bundle, host →
  topic) was not re-checked by this run, so the new file keeps only
  `generated`. Only facts actually re-verified in this session get the
  machine confirmation, and only for those entries.
- Set `sources` with the active GitHub issue when the entry
  references one (OKF §5.1); keep existing `sources` entries that
  remain relevant.
- Files are `status: stable` by default; per-entry lifecycle lives in
  the entry text (`[ACTIVE until #NNN]`, HISTORY relocation), not in
  the file-level `status` field.

### 3b. Prune Superseded Entries

Pruning applies to **every active concept file** being updated,
including `hosts/<host>/<thema>.md` and `topics/<thema>.md`:

- **Never pruned:** `hosts/<host>/chronik.md` is append-only — old
  entries stay, even when the described state has changed; a later entry
  supersedes them in reading order. `HISTORY.md` stays **one** file and
  is never split or pruned either.
- **`index.md` files are regenerated, not pruned:** a link to a removed
  concept disappears when the index is rebuilt (step 5b).

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
5. Bump `generated.at` on the active file and on `HISTORY.md`.

**PITFALLS.md special case**: Distinguish between:
- **(a) Permanent non-obvious constraints** (e.g., "Room validates
  PRAGMA table_info, PK must be NOT NULL") — these stay in active
  PITFALLS.md.
- **(b) Bugs that were fixed** (e.g., "clearText+typeText race, fixed
  in #254") — these MOVE to HISTORY.md once the fix ships. Their value
  is historical, not advisory.

The same (a)/(b) split applies inside a host bundle's `# Fallstricke`
section and a topic file — a fixed bug there also goes to HISTORY.md.

**Status-tag convention**: For active-file entries with a known
lifecycle (e.g., a workaround slated for removal), append an optional
trailing tag `[ACTIVE until #NNN]` so a future pruner knows to
relocate it.

### 4. Rewrite `ARCHITECTURE.md` (if structural changes occurred)

- Determine whether the session introduced any structural changes:
  new/removed/renamed commands, skills, knowledge files, hosts or
  host subsystems, or significant changes to data flows, dependencies,
  or component relationships.
- If no structural changes occurred, skip this step and leave
  `ARCHITECTURE.md` unchanged.
- If structural changes did occur, **overwrite** `docs/ai/ARCHITECTURE.md`
  with the current system snapshot using the template in
  [FILE-TEMPLATES.md](./FILE-TEMPLATES.md).
- Like STATE.md, this file is overwritten (not appended) because it
  represents a point-in-time structural map, not a chronological log.

### 5. Write `HANDOFF.md` and `STATE.md`

- Check the task list maintained during this session.
- If any tasks are still [PENDING] or [IN PROGRESS], write them to
  `docs/ai/HANDOFF.md` using the template in
  [FILE-TEMPLATES.md](./FILE-TEMPLATES.md).
- Include: the current branch, each open task with file paths and
  line numbers where applicable, and any context the next agent
  needs to avoid re-discovery.
- If all tasks are complete, clear the file body and write only:
  `No pending tasks. Last cleared: YYYY-MM-DD.`

**HANDOFF.md contains ONLY open tasks** — no session narrative, no
"what was done" log, no resolved items (those live in HISTORY.md or in
the host chronik).

- **Host tagging (mandatory):** each task is prefixed with its host and
  links the host bundle, e.g.
  `1. [ ] murl: Rspamd-Migration — [hosts/murl/index.md](hosts/murl/index.md)`.
  Tasks that span hosts are grouped under `Flotte` and link the
  matching `topics/<thema>.md`.

**`STATE.md` is a short fleet status, not a session archive:**

- one short paragraph for the overall picture,
- one bullet per host with the current state and a link to
  `hosts/<host>/chronik.md`,
- an "open threads" section that points at the host bundles instead of
  repeating their detail.

Dated narratives never go into STATE.md — they belong in the host
chronik. If a STATE bullet turns into a story, move the story and leave
the link.

#### Escalation Rule

- If an open task would require more than ~30 minutes of agent work,
  do NOT put it in HANDOFF.md alone.
- **GitHub-Projekte:** Create a GitHub issue:
  `gh issue create --title "<title>" --body "<body>"` — but only **after**
  the Duplicate Check from the `issue-workflow` skill reports no matching
  open issue (reuse that issue instead, and reference its number here). In
  HANDOFF.md, reference only the issue number:
  `1. [ ] See #42 — Refactor enrollment module to cursor pagination`
- **SVN-Projekte ohne Issue-System** (z. B. `~/svn/georg`, Deployed-Trees auf
  murl/claw): es existiert KEIN Issue-Tracking — solche Aufgaben bleiben
  vollständig in HANDOFF.md (mit Datei-/Pfad-Angabe); kein `gh`-Aufruf.
- This keeps HANDOFF.md small and actionable while large work is
  properly tracked (via issues in GitHub, via HANDOFF.md in SVN).

### 5b. Update `log.md` and regenerate `index.md`

- **`log.md`** (OKF §9): append one date-grouped entry at the top of
  the log (newest first) summarizing this run: for each updated file
  an `**Update**` / `**Creation**` / `**Deprecation**` line linking
  the concept. NO frontmatter in `log.md`.
- **`index.md`** (OKF §8): regenerate from the current directory
  state. Keep `okf_version: "0.2"` in the bundle-root frontmatter
  (the only frontmatter an `index.md` may carry). Entries include the
  concept's `description`. Skip files the run did not touch only to
  note them as unchanged — the index always lists ALL files.
- **Nested indexes:** `hosts/index.md`, `topics/index.md` and every
  `hosts/<host>/index.md` are reserved indexes too (no frontmatter).
  They are regenerated whenever a concept below them is added, renamed
  or removed: `hosts/index.md` lists the host bundles plus their
  `chronik.md`, `topics/index.md` lists the topic files, and
  `hosts/<host>/index.md` carries role/OS/IPs on top and a link list of
  the host's concept files below.

### 6. Update `AGENTS.md`

- Ensure the project-level `AGENTS.md` (in project root or `.opencode/`)
  contains the bootstrap instruction block. If it does not, append it.

### 7. Comment on Active Issue (nur GitHub-Projekte; SVN: skip)

- **Anwendbarkeit:** nur für GitHub- (bzw. Git-)Projekte. In SVN-Projekten
  ohne Issue-System (`~/svn/georg` etc.) diesen Schritt still überspringen.
- If there is a known active GitHub issue for the current session, post a
  brief comment summarizing what knowledge was persisted (files updated,
  key additions). Example:
  `gh issue comment 42 --body "Knowledge persisted: added 3 entries to CONVENTIONS.md, updated STATE.md."`
- **NEVER close, reopen, or change the state of any issue.** This skill
  only adds comments for traceability.
- If no active issue is known, skip this step silently.

### 8. Commit and Push (mandatory)

- **Git-Projekte:** Stage the knowledge files and create a commit that
  references the active issue, e.g. `docs: persist knowledge (#42)`. Preserve
  the repository's commit-message style, keep the issue reference, then push to
  the trunk line. Never write an empty commit — if nothing changed, report
  "nothing to persist" and stop.
- If several commits are needed, that is fine; what is forbidden is leaving
  knowledge changes uncommitted or unpushed.
- **SVN-Projekte** (z. B. `~/svn/georg`, Deployed-Trees): Analogon ist ein
  `svn ci` mit klarer deutscher Commit-Message.
- The commit may land **after** an issue is closed (e.g. STATE.md/HANDOFF.md
  record the closed state) — the knowledge commit is the follow-up that carries
  those files to the trunk.
- This skill still NEVER closes, reopens, or changes the state of an issue
  (see step 7 and Constraints).

### 9. Confirmation

- After committing and pushing, list every file that was created or modified,
  and for each show the number of entries added, updated, or removed.
- Confirm the OKF state of every file **this run created or modified**
  (parseable frontmatter, non-empty `type`; `index.md` regenerated;
  `log.md` records this run — OKF-SPEC.md §11). List any remaining
  legacy files (no frontmatter) with a one-line note that they are
  tolerated and migrate on their next touch. Never migrate untouched
  files just to make the confirmation pass — that would be the
  big-bang migration this skill forbids.
- **Run the bundle checker** where it is available:
  `EDV/Toolset/okf-check --root docs/ai`. It verifies conformance
  (frontmatter, reserved filenames), that every `index.md` links all
  concepts of its directory, and that links resolve. After a move or a
  split, prove losslessness against the previous state:
  `EDV/Toolset/okf-check --root docs/ai --preserve-from <exported-old-tree>`.
  The tool lives in the `~/svn/georg` working copy; in other projects
  skip it and state that it was not available, instead of hand-waving
  conformance.
- State the commit hash and that it was pushed.

## Done when

- [ ] `docs/ai/index.md` and every file the run touches were read; on a host
      context, the host bundle and its topic files as well.
- [ ] Every fact, decision and status change of the session was diffed against
      the files; observed drift is either corrected or filed as a HANDOFF task.
- [ ] Every touched file carries the OKF envelope with a bumped `generated.at`;
      superseded entries were moved to HISTORY.md, not deleted.
- [ ] HANDOFF.md holds only open tasks (or `No pending tasks. Last cleared:
      …`), and STATE.md was overwritten, not appended.
- [ ] One `log.md` entry was appended and every affected `index.md` (root,
      `hosts/`, `topics/`, each host) was regenerated.
- [ ] OKF conformance is confirmed — `okf-check` run, or its unavailability
      stated instead of hand-waved.
- [ ] The changes are committed with the active issue reference and pushed
      (SVN: `svn ci`), or "nothing to persist" was reported.

## File Templates and Content Rules

Templates and per-file content rules for `docs/ai/` are in
[FILE-TEMPLATES.md](./FILE-TEMPLATES.md). Use the template for a file when
creating or overwriting it.

## Constraints

- **Commit + push is part of persistence.** Every run ends on the trunk: a
  commit with the active issue reference, pushed (Git) or `svn ci` (SVN).
  Uncommitted/unpushed knowledge files violate this skill.
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
- HISTORY.md is append-only and stays **one** file: never split it per
  host and never relocate entries out of it. It grows over time — that
  is accepted; keep new entries short instead of splitting the archive.
- Placement is not a matter of taste: step 3's rules decide between
  `hosts/<host>/`, `topics/` and the global files. A host-named entry
  in a global file is a defect (the `okf-check` placement lint warns on
  it), and a fleet-wide rule buried in one host bundle is a defect too.
- `hosts/<host>/chronik.md` is append-only: never edit, reorder or
  prune past narrative entries, and never move them to HISTORY.md.
- **Issue Safety**: This skill is a documentation-only operation. It
  must NEVER close, reopen, or change the state of any GitHub issue.
  Issue lifecycle management is the exclusive responsibility of the
  `issue-workflow` skill (continuous completion criteria or its `finish`
  override mode). When invoked standalone, this
  skill may only create new issues (Escalation Rule) or comment on
  existing ones. — gilt diesbezüglich nur für GitHub-Projekte;
  SVN-Projekte ohne Issue-System haben schlicht keine Issues (dann
  entfällt der ganze Mechanik still).
- **OKF Integrity**: `docs/ai/` is an OKF v0.2 bundle
  ([OKF-SPEC.md](./OKF-SPEC.md)). The reserved filenames `index.md`
  and `log.md` are never used for concept documents (`index.md` is
  reserved at every directory level, `log.md` only at the bundle
  root), `log.md` gets no frontmatter, and frontmatter `type` is always
  present and non-empty. Unknown extra frontmatter keys are allowed
  (producers may extend).
- **No fabricated trust**: never write a `human:<id>` `verified` entry
  on your own — machine-verified is the maximum an agent may claim.
