---
name: issue-workflow
description: Manage issue-based start, checkpoint, and finish workflows with mandatory issue-linked commits
license: MIT
compatibility: opencode
metadata:
  category: workflow
  scope: github
---

# Issue Workflow Skill

## Purpose

This skill manages GitHub issue-centered work from start through progress
checkpoints to final completion. It standardizes how the agent discovers or
creates an issue, reports progress, commits work, and closes out delivery.

Use this skill whenever the user expresses issue-oriented intent through
natural language (e.g., "issue start", "issue commit", "issue commit and push").

## Required Inputs

- `mode`: one of `start`, `commit`, or `finish`
- `issue`: optional issue identifier or `new`
- `context`: optional plain-language task summary, plan, or notes

## Core Rules

- Every commit created by this workflow must reference a GitHub issue number.
- Never create a commit without first identifying an existing issue or creating
  a new one.
- If no relevant issue exists and a commit is needed, create the issue first,
  then use its number in the commit message.
- Prefer keeping one clear issue per workstream; do not scatter related changes
  across multiple issues unless the user explicitly requests it.
- Use `gh` for all GitHub issue operations.
- **Sub-Issues Rule:** When breaking a task into smaller issues, or when starting work on a task that belongs to a parent epic, you **MUST** establish a formal parent-child relationship using the Sub-Issues API. Mentions in the description are secondary to this formal link. Always use the `issue-workflow` skill for issue creation to ensure this protocol is followed.
- **Never close an issue that has open sub-issues.** Before closing any issue,
  list its sub-issues and verify all are closed first.
- Do not close an issue unless the workflow is running in `finish` mode and the
  implementation is actually complete.

## Commit Message Rule

- Any commit created by this workflow must include the issue reference, such as
  `feat: add report export (#123)` or `fix: handle empty inputs (#123)`.
- If the repository already uses a recognizable commit message style, preserve
  that style while still including the issue number.

## Mode Protocols

### 1. `start`

Use this mode to begin or resume work.

- If `issue` is an explicit issue number, fetch it with
  `gh issue view <N> --json title,body,comments` and read the description plus comments.
  Check if the issue has a parent or should be linked as a sub-issue to an existing epic.
- If `issue` is `new`, or if no usable issue exists for the current work,
  create a new issue from the provided context. If the new issue is part of a larger epic, link it as a sub-issue immediately.
- If no issue is supplied, infer whether there is already a current issue for
  the work. If not, create one before proceeding.
- Assess the codebase against the issue. If the requested functionality is
  already complete, comment with the finding. Before closing, check for open
  sub-issues. If open sub-issues exist, report them and keep the issue open;
  otherwise close the issue and stop.
- Resolve any blocking ambiguity with the user only after doing all safe local
  discovery work first.
- Update the issue description or add a progress comment with the current plan,
  scope, or todo list.
- Implement the requested changes.
- Do not commit in `start` mode unless the user explicitly asks for it.

### 2. `commit`

Use this mode when progress should be saved but the issue remains open.

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
- Push the branch.
- Keep the issue open.

### 3. `finish`

Use this mode when the task is complete and the issue should be closed.

- Ensure a current issue exists; create one if somehow missing so the completed
  work still has a tracked issue reference.
- Comment on the issue with a final implementation report.
- Persist all newly acquired session knowledge by also using the
  `knowledge-persistence` skill before finalizing the workflow.
  Note: knowledge-persistence itself never closes issues. The issue
  closure below is owned exclusively by this `finish` mode.
- Review git status and remaining changes.
- Create the final commit including the issue number.
- Push the branch.
- **Before closing the issue**, list its sub-issues via:
  `gh api repos/{owner}/{repo}/issues/{NUMBER}/sub_issues --jq '.[].number'`
  If any sub-issues remain open, the issue **must not** be closed. Report the
  open sub-issues and keep the parent open.
- Close the issue with a short closing comment if helpful.

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
