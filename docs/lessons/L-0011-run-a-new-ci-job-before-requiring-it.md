---
id: L-0011
title: A pull_request_target job cannot run before it merges; prove it on a small PR before requiring it
date: 2026-10-11
project: agent-os
kind: practice
status: proposed
rule: A new pull_request_target workflow merges first, runs on a small low-risk PR, and only then becomes a required check.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/actions/runs/38168849260
  - https://github.com/andres-fu/agent-os/pull/6
---

## What happened
The principal-review workflow could not run on its own PR, because
`pull_request_target` always runs `main`'s copy. Its first real run, on a docs
PR, failed before Claude started: an environment setting needed bubblewrap,
which the runners lack. Had the check already been required, every PR would
have been blocked until the stakeholder edited the ruleset.

## What we changed
The check was required only after a green run on PR #5. The broken setting was
removed in PR #6.
