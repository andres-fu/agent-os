---
id: L-0021
title: Tests that saw red and went green can still miss the fail-closed paths; breaking each one on purpose finds the gaps
date: 2026-10-26
project: agent-os
kind: practice
status: proposed
rule: Before calling fail-closed code done, break each guard once on purpose (a read failure, a limit, an identity or input check) and see a test fail; add a test for every break that passes.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/57
  - commit:2e9401e
---

## What happened
The night-shift picker and log writer were written test-first. Every module
went red, then green, and dope-tdd reported them PROVEN: it changes the code
a few ways and checks that a test fails.

Breaking guards on purpose still found four that no test covered:
- an `unlabeled` event counted as adding the label;
- an unreadable ready-for-review event was assumed fine;
- `--repo` without a slash was accepted;
- issue number 0 was accepted, because `> 0` versus `> 1` was never tested.

The first three came from 15 hand-made breaks of `pick.mjs`. The fourth was a
change dope-tdd reported as uncaught. Each break would have weakened a safety
check while every test stayed green.

## What we changed
PR 57 added a test for each break before it merged, and its receipt lists the
breaks. The rule is to do this for every fail-closed guard, not only where
dope-tdd happens to change the code.
