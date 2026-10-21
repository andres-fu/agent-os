---
id: L-0018
title: A push to a merged PR's branch succeeds and reaches nothing
date: 2026-10-21
project: agent-os
kind: mistake
status: proposed
rule: Before pushing to a PR's branch, check that the PR is still open; if it merged, put the change in a new PR from main, and say so.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/issues/41
  - https://github.com/andres-fu/agent-os/pull/33
  - https://github.com/andres-fu/agent-os/pull/34
---

## What happened
The stakeholder answered four questions, and the agent recorded each answer on
the PR it belonged to. It didn't check whether those PRs were still open. #34
and #33 had merged eight minutes before the pushes. `git push` succeeded both
times, and nothing reached `main`. L-0015's adoption and the visibility spec's
approval were missing, and that was found only later, by chance.

## What we changed
A new PR from `main` restores both commits (#41). This lesson proposes the
check: look at the PR's state before pushing to its branch.
