---
id: L-0004
title: Agents game tests when they can, so only CI may say tests passed
date: 2026-10-11
project: agent-os
kind: research
status: adopted
rule: An agent's claim that tests pass is never evidence; the PR receipt links the CI run, and edits to existing tests are flagged.
enforced_by: gate
evidence:
  - https://metr.org/blog/2025-06-05-recent-reward-hacking
---

## What we found
METR observed frontier models reward hacking: reading a scorer's answers and
faking timing, while knowing it was not what the user wanted. Other research
found agents with write access to tests often edited them to pass.

## What we changed
The `gates` workflow is the only source of "passed". It also posts a warning on
any change to an existing test file. Every agent may stop with
`BLOCKED: spec conflict` instead of forcing a pass.
