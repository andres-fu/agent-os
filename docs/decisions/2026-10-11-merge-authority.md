---
title: Who may merge a pull request, and what enforces it?
status: decided
raised_by: stakeholder
date: 2026-10-11
decided_by: Andres Fuentes (stakeholder)
decided_on: 2026-10-11
---

## Decision
Authors never merge their own work. An independent principal engineer, run in
CI, decides; the stakeholder keeps the rules.

- **Routine PRs:** the `principal-review` workflow runs the principal engineer
  from `main` against the PR's diff, as text, with read-only tools. On
  **Approve**, and only if no protected file changed
  (`tools/review/protected-paths.mjs`), it turns on auto-merge for that exact
  commit, by **rebase**. GitHub merges once every required check is green.
- **Protected PRs** (the charter, `.claude/`, `.github/`, `docs/decisions/`,
  `docs/specs/`, `docs/lessons/`, `docs/landscape.md`, `tools/`, `package.json`,
  the lockfile and scanner configs): the principal engineer still reviews, and
  the **stakeholder merges**. Merging a spec is the stakeholder's approval of it.
- **`request_changes` or `escalate`:** the `principal-engineer` check fails, so
  the ruleset blocks the merge. For an escalation, the stakeholder decides,
  then:
  1. unticks `principal-engineer` in the ruleset under required checks;
  2. merges the PR;
  3. ticks `principal-engineer` again straight away, with its source still
     GitHub Actions.

  The bypass list stays empty.

## What enforces it today
| Rule | Enforced by |
| --- | --- |
| No merge without CI's Approve on the latest commit | **GitHub**: the ruleset requires the `principal-engineer` status from GitHub Actions, so a status posted from a person's account does not count |
| Escalated or rejected PRs cannot merge | **GitHub**: the same required check fails |
| Agents do not merge approved protected PRs, or edit the ruleset | **Only agent instructions and `.claude/settings.json`'s deny list.** Agents act under the stakeholder's (admin) GitHub account, so GitHub cannot tell them apart |
| The reviewer cannot be edited by the PR it reviews | **GitHub**: `pull_request_target` runs `main`'s workflow and role |
| The reviewer reads no untrusted web content | In CI, **Claude Code's tool limits** (Read, Grep, Glob only); in other sessions, an instruction (lesson L-0008) |

## Known limits
- While `principal-engineer` is unticked to merge an escalated PR, any PR can
  merge without CI's approval. Keep that window to the one merge.
- Agents share the stakeholder's account (see the table). A separate bot account
  would make GitHub enforce the third row; it was considered and set aside as
  too much setup for now. `.github/CODEOWNERS` is ready for it but inactive.
- Prompt injection in a PR could talk the reviewer into approving. An approved
  PR that changes no protected file auto-merges once the gates pass. Summaries
  carrying long encoded strings are withheld (`tools/review/check-summary.mjs`).
- Rebase keeps every commit on `main`: the red-then-green test history survives,
  but so does anything added and then removed within a PR (gitleaks scans every
  commit), and `git bisect` meets red commits by design.
- The reviewer is the same model family as the authors.
- Merges by `github-actions[bot]` do not trigger workflows on `main`; the PR
  already passed every required check.
- Revisit all of this if the repository goes public.

## History
Options considered on 2026-10-11, all in
[andres-fu/agent-os#3](https://github.com/andres-fu/agent-os/pull/3),
[#4](https://github.com/andres-fu/agent-os/pull/4) and
[#9](https://github.com/andres-fu/agent-os/pull/9):
the stakeholder merges everything; agents merge on the principal engineer's
approval by instruction only (rejected: nothing enforced it); a bot account (set
aside as too much setup); the reviewer in CI with a required status (chosen).
Specs became protected and escalations kept blocking after the principal
engineer escalated
[#8](https://github.com/andres-fu/agent-os/pull/8#issuecomment-6113269613); an
"escalate gives a green check" variant was rejected because it made PRs with no
approval mergeable. Full reasoning is in those PRs and this file's git history.
