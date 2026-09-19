---
name: issue-workflow
description: Continuous issue awareness with proactive issue-linked commit and push; natural-language modes (start, commit, finish) remain as manual overrides
license: MIT
compatibility: opencode
metadata:
  category: workflow
  scope: github
---

# Issue Workflow Skill

## Purpose

This skill governs issue-centered work as a **continuous state**, not a
user-invoked sequence. At any point in a session the agent knows which issue
it is working under, commits and pushes completed units proactively, and
closes the issue when the completion criteria are met. The natural-language
triggers ("issue start", "issue commit", "issue commit and push") are manual
overrides, not activation conditions — the rules below apply even without
being invoked.

## Continuous Issue Awareness

- At any point in a session, the agent must know which GitHub issue it is
  currently working under, and announce it (e.g., "Working under issue
  #123: <title>").
- Before starting work, resolve the current issue: search open issues first
  (`gh issue list` / `gh issue view <N> --json title,body,comments`) for one
  matching the task.
- If no existing issue matches and the task is clearly a new topic, create a
  new issue immediately and **without user interaction**, then announce it.
- If the assignment is ambiguous (several candidate issues, or unclear
  whether a new one is needed), ask the user before touching code.
- The assignment to an issue may change mid-session when the user redirects
  the work; resolve the new issue the same way.

## Trunk-Based Development (this repo)

This repository follows **trunk-based development**:

- The trunk is the **`dev` branch**. All work happens directly on `dev`.
- **No feature branches.** Do not create, use, or merge feature branches.
  Exceptions are `master` (production, protected — changes land via PR from
  `dev` only) and infrastructure branches that GitHub creates implicitly
  (e.g. Copilot worktrees).
- **Pull first, always:** Before ANY work session (or resuming work), lift
  the working copy onto the trunk with `git pull --ff-only origin dev`.
  - If the pull fails or reports conflicts: STOP immediately and report to
    the user; do not continue on a stale tree.
  - Rationale: trunk-based workflows depend on always building from the
    current state — otherwise avoidable conflicts and re-discovery of other
    people's commits pile up.

## Required Inputs

- `mode`: one of `start`, `commit`, or `finish` — optional, only when the
  user triggers a manual override by natural language
- `issue`: optional issue identifier or `new`
- `context`: optional plain-language task summary, plan, or notes

## Core Rules

- Every commit created under this workflow must reference a GitHub issue
  number with a hashtag, e.g. `feat: add report export (#123)`. Never
  fabricate issue numbers.
- **Proactive Commit and Push:** After each completed, self-contained unit of
  work, commit and push immediately — do not wait for the user to request it
  or for a trigger phrase. This overrides the opencode default "never commit
  unless the user asks". See "Proactive Commit and Push" below.
- **Green commits only:** run `npm run lint` (and tests once they exist)
  before committing; never push a broken state.
- Never create a commit without first identifying an existing issue or
  creating a new one.
- If no relevant issue exists and a commit is needed, create the issue first,
  then use its number in the commit message.
- Prefer keeping one clear issue per workstream; do not scatter related changes
  across multiple issues unless the user explicitly requests it.
- Use `gh` for all GitHub issue operations.
- **Sub-Issues Rule:** When breaking a task into smaller issues, or when starting work on a task that belongs to a parent epic, you **MUST** establish a formal parent-child relationship using the Sub-Issues API. Mentions in the description are secondary to this formal link. Always use the `issue-workflow` skill for issue creation to ensure this protocol is followed.
- **Never close an issue that has open sub-issues.** Before closing any issue,
  list its sub-issues and verify all are closed first.
- Do not close an issue unless the implementation is actually complete and
  the completion criteria in "Issue Completion" are met.

## Commit Message Rule

- Any commit created by this workflow must include the issue reference, such as
  `feat: add report export (#123)` or `fix: handle empty inputs (#123)`.
- If the repository already uses a recognizable commit message style, preserve
  that style while still including the issue number.

## Proactive Commit and Push

These rules apply at any time during session work, without a trigger phrase:

- After each completed, self-contained unit of work, commit and push
  immediately — do not wait for the user to request it or for a mode
  invocation. This overrides the opencode default "never commit unless the
  user asks".
- **Green commits only:** run the repository's lint/tests for the affected
  area first. Commit only when they pass. If verification fails, fix or
  report — never push a broken state.
- The commit message must include the issue reference (see Commit Message
  Rule) and preserve the repository's existing style.
- No empty commits. If there is nothing to commit, say so instead.
- Trunk-based: commit and push **directly to `dev`**; no feature branches
  or PRs. The pre-push hook (`.githooks/pre-push`, lint gate) automatically
  blocks pushes to `dev` when `npm run lint` fails — activate it once per
  clone with `git config core.hooksPath .githooks`.
- Explicit "hold back" requests from the user always win over this policy.

## Manual Override Modes

The modes below are **manual overrides** triggered by natural language.
The continuous rules above (issue awareness, proactive commit/push) apply
regardless; the modes force a specific checkpoint behavior.

### 1. `start`

Use this mode to explicitly begin or resume work (e.g., "issue start").

- If `issue` is an explicit issue number, fetch it with
  `gh issue view <N> --json title,body,comments` and read the description plus comments.
  Check if the issue has a parent or should be linked as a sub-issue to an existing epic.
- If `issue` is `new`, or if no usable issue exists for the current work,
  create a new issue from the provided context. If the new issue is part of a larger epic, link it as a sub-issue immediately.
- If no issue is supplied, infer whether there is already a current issue for
  the work. If not, create one before proceeding.
- Assess the codebase against the issue. If the requested functionality is
  already complete, comment with the finding and follow the completion
  criteria in "Issue Completion" (check open sub-issues first).
- Resolve any blocking ambiguity with the user only after doing all safe local
  discovery work first.
- Update the issue description or add a progress comment with the current plan,
  scope, or todo list.
- Implement the requested changes, then apply the Proactive Commit and Push
  rules — commit and push with the issue reference without waiting for a
  further request.

### 2. `commit`

Use this mode to force an immediate checkpoint while the issue remains open
(e.g., "issue commit", "checkpoint").

- Ensure a current issue exists; create one if needed from the current context.
- Comment on the issue with a concise implementation report covering:
  - what was completed
  - what remains
  - known risks, blockers, or follow-ups
- Persist session knowledge by invoking the `knowledge-persistence` skill.
  Note: knowledge-persistence never closes issues; it only adds comments
  for traceability.
- Review git status and staged/unstaged changes.
- Create a commit that includes the issue number.
- Push to `dev`.
- Keep the issue open.

### 3. `finish`

Use this mode to force finalization and issue closure (e.g., "issue finish",
"issue fertig").

- Ensure a current issue exists; create one if somehow missing so the completed
  work still has a tracked issue reference.
- Comment on the issue with a final implementation report.
- Persist all newly acquired session knowledge by also using the
  `knowledge-persistence` skill before finalizing the workflow.
  Note: knowledge-persistence itself never closes issues. The issue
  closure below is owned exclusively by this `finish` mode.
- Review git status and remaining changes.
- Create the final commit including the issue number.
- Push to `dev`.
- **Before closing the issue**, list its sub-issues via:
  `gh api repos/{owner}/{repo}/issues/{NUMBER}/sub_issues --jq '.[].number'`
  If any sub-issues remain open, the issue **must not** be closed. Report the
  open sub-issues and keep the parent open.
- Close the issue with a short closing comment if helpful.

## Issue Completion

Applies at any time, independent of the modes:

- When the agent believes the issue's goal is fully implemented, it normally
  **asks the user** before closing the issue.
- The agent may close the issue **autonomously** only when ALL of these hold:
  - the implementation covers the issue goal completely,
  - verification (lint/tests) is green,
  - the issue has no open sub-issues (always check via the sub-issues API first),
  - the user has not signalled anything that contradicts completion.
- Before closing, also comment on the issue with a final implementation
  report (persist session knowledge via `knowledge-persistence` when new
  knowledge exists).
- Otherwise report the status, state what is missing, and ask.

## Issue Creation Guidance

When creating an issue:

- Write a short, outcome-oriented title.
- Include enough body detail for a future agent to understand scope and intent.
- **Link as Sub-Issue:** If this issue is a component of a larger task, identify the parent issue and link it as a sub-issue immediately after creation.
- If a plan already exists, use it as the issue body or convert it into a short
  checklist.

## Sub-Issues (Parent-Child Linking)

GitHub supports proper parent-child issue relationships via the Sub-Issues REST
API. Simply mentioning a parent issue number in the body text is **not
sufficient** — it creates only a loose text reference, not a tracked
relationship.

### Creating a sub-issue

1. Create the child issue with `gh issue create` as usual.
2. Look up the **database `id`** (not the issue `number`) of the child:
   ```bash
   gh api repos/{owner}/{repo}/issues/CHILD_NUMBER --jq '.id'
   ```
3. Link it to the parent:
   ```bash
   gh api --method POST /repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues \
     --input - <<< '{"sub_issue_id": CHILD_DATABASE_ID}'
   ```

**Important:** The `sub_issue_id` field must be an **integer** (the internal
database ID), not the human-readable issue number. Using `-f sub_issue_id=N`
sends a string and causes a 422 validation error. Always use `--input` with a
JSON body instead.

### Listing sub-issues

```bash
gh api repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issues --jq '.[].number'
```

### Removing a sub-issue link

```bash
gh api --method DELETE /repos/{owner}/{repo}/issues/PARENT_NUMBER/sub_issue \
  --input - <<< '{"sub_issue_id": CHILD_DATABASE_ID}'
```

### When to use sub-issues

- When breaking down a parent epic into individually trackable work items.
- When the parent issue should show a progress summary
  (`sub_issues_summary.total` / `completed` / `percent_completed`).
- Each sub-issue can be assigned, labeled, and closed independently; closing
  all sub-issues does **not** auto-close the parent.
- **A parent issue must never be closed while it has open sub-issues.**
  Either close all children first, or re-parent them before closing the parent.

### Avoiding concurrent-link conflicts

When linking multiple sub-issues in rapid succession, avoid sending all
requests in parallel — the API uses sequential priority positions and will
return `422 Priority has already been taken`. Link them sequentially or with a
small delay between calls.

## Reporting Guidance

Issue comments should be compact but useful.

- Progress comments should mention completed work, current status, and next
  steps.
- Final comments should mention the shipped outcome and any noteworthy caveats.

## Safety Constraints

- Never fabricate issue numbers.
- Never create an empty commit when there are no changes.
- If there are no local changes in `commit` or `finish` mode, still update the
  issue comment as needed, but report that there was nothing to commit.
- Do not push or close issues if the relevant step fails.
- Never close an issue that has open sub-issues. Always check for open
  sub-issues before closing.

## Output Expectations

At the end of the workflow, report:

- the issue number used or created
- whether a comment was added
- whether a commit was created, including its message
- whether knowledge persistence was run
- whether the issue remains open or was closed
