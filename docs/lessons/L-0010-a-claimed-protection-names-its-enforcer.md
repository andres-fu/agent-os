---
id: L-0010
title: Every claimed protection must name what enforces it
date: 2026-10-11
project: agent-os
kind: mistake
status: proposed
rule: When a document says something is prevented or protected, it says what prevents it (a gate, a ruleset, a permission rule) or calls it an instruction.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112534173
  - https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112574652
  - https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112585659
  - https://github.com/andres-fu/agent-os/pull/4#issuecomment-6112717599
---

## What happened
Four reviews in a row found the author claiming a protection stronger than the
real one: rule changes "need the stakeholder" with nothing enforcing it;
approvers with "no web access" who still had a shell; the stakeholder merging
as "the only enforced option" on a shared account; agents that "cannot merge"
behind a prefix-matching deny list.

## What we changed
Each document now says what enforces each rule, and calls the rest
instructions. The real gate is the ruleset requiring the `principal-engineer`
status from GitHub Actions.
