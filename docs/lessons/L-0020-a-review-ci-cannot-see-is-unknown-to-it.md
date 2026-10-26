---
id: L-0020
title: A security review run outside CI is invisible to the CI reviewer, so it escalates instead of approving
date: 2026-10-26
project: agent-os
kind: practice
status: proposed
rule: When a change hits a security trigger, run security-compliance where the CI reviewer can read its verdict (in CI, or as a committed review file for the exact commit), not only as a local subagent quoted in the PR description.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/56
  - https://github.com/andres-fu/agent-os/actions/runs/40381968340
  - https://github.com/andres-fu/agent-os/pull/57
  - https://github.com/andres-fu/agent-os/actions/runs/40402164516
---

## What happened
Both the night-shift plan (PR 56) and its first build PR (PR 57) hit security
triggers. Each time, security-compliance ran locally as a subagent, and the PR
description quoted its verdict. Each time, the CI principal engineer marked
that review *unknown*, because it can't see a local session:
- **PR 56:** "I can't see those review outputs, and the stakeholder ... should
  confirm them."
- **PR 57:** it escalated, listing "Security review not on record" as one of
  its three reasons.

A description written by the author is the author's claim. The honesty rules
say only evidence the reviewer can check counts.

## What we changed
Nothing yet. The options for the stakeholder:
- **Run security-compliance in CI** on PRs that touch a trigger path. This is
  a gate, and the strongest option. It costs one more review per triggered PR.
- **Commit the verdict** as a review file tied to the commit SHA, checked by
  `tools/review/check-review.mjs`. This is cheaper, but the author still writes
  the file.
- **Keep it as is**, and have the stakeholder confirm local reviews at merge
  time. This is what happens today.
