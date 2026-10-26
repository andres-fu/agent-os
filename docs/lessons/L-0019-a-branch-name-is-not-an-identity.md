---
id: L-0019
title: In a public repository a branch name is not an identity; anyone can open a PR from a fork with any name
date: 2026-10-26
project: agent-os
kind: mistake
status: adopted
rule: When a rule depends on who made a PR, comment or label, identify it by fields outsiders cannot set (the head repository, the author or the event's actor), never by a branch name, title or text.
enforced_by: agent-rule
evidence:
  - https://github.com/andres-fu/agent-os/pull/50
  - https://github.com/andres-fu/agent-os/pull/50#issuecomment-6422712381
  - https://github.com/andres-fu/agent-os/actions/runs/40367615430
  - commit:2179aaa
---

## What happened
PR #50 added a cap to the night-shift spec: the night shift does not run while
three PRs whose head branch starts `night/` are open. The repository is
public, so anyone can open a PR from a fork with a branch named `night/a`.
Three of those would pause the night shift indefinitely. The first draft of
the same PR had a second instance of the same mistake: the morning brief would
read `Kind: decision` from any `BLOCKED:` comment, and anyone can comment on a
public issue. The CI principal engineer requested changes on the first, and
security-compliance raised the second as advice. Neither the author nor the
spec checker caught them.

The spec already did this right for labels: it accepts `ready` only when the
stakeholder's own account added it (the label event's actor). The new parts
did not carry that rule over.

## What we changed
Commit 2179aaa (d59a258 on the PR branch) defines a night PR as one whose head
repository is this repository, whose branch starts `night/` and whose author
is the agents' App. The cap, the one-PR-a-night check and the brief all use
it. The next commit (d0bf64a) counts a block, or reads a handoff note, only from the
App's own comments and PRs. Acceptance criteria cover fork PRs, PRs by other
authors and comments by other accounts. This lesson proposes the general
rule.

## Adopted
Adopted by the stakeholder on 2026-10-26, in the session ("Adopt L-0019 as an
agent-rule"). Enforced by an agent-rule: a line in the review rubrics of
`.claude/agents/principal-engineer.md` (Correct) and
`.claude/agents/security-compliance.md` (Trust boundaries). The CI principal
engineer reads its role file as it is on `main`, so the line applies to PRs
reviewed after this merges.
