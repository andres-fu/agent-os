---
title: Who may merge a pull request?
status: decided
raised_by: stakeholder
date: 2026-10-11
decided_by: Andres Fuentes (stakeholder)
decided_on: 2026-10-11
---

## Context
Until now the charter said agents never merge, so every PR waited for the
stakeholder (*observed*: CLAUDE.md before this change). The stakeholder asked
for an independent, principal-level reviewer whose approval is the real gate, so
that routine work does not wait on them.

## Options
| Option | Cost | Risk | Reversible? |
| --- | --- | --- | --- |
| A. Stakeholder merges everything | Stakeholder time on every PR | Lowest | Yes |
| B. An agent merges when gates are green and the principal engineer approves; changes to the rules still need the stakeholder | One Opus review per PR | An agent-only approval chain on routine work | Yes: edit this file |
| C. An agent merges when gates are green | Lowest | No independent judgment | Yes |

## Recommendation
B. The gates prove the code works; the principal engineer judges whether it
should exist and fits the whole; the stakeholder keeps the rules themselves.

## Decision
**B.** An agent may merge a pull request only when:
1. every required check is green on the PR's latest commit, and
2. the `principal-engineer` agent's verdict on that commit is **Approve**, posted
   on the PR, and
3. the PR does not change `CLAUDE.md`, `AGENTS.md`, `.claude/agents/`,
   `.github/workflows/`, `docs/decisions/`, or adopt a lesson.
Anything in 3 is merged by the stakeholder. The principal engineer is a Claude
agent with a fresh context; a reviewer from a different vendor is added when
Codex support lands. Merging the PR that adds this file confirms the decision.
