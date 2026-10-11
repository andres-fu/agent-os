---
id: L-0006
title: Multi-agent runs cost many times more tokens; parallelize only independent work
date: 2026-10-11
project: agent-os
kind: research
status: adopted
rule: One writer per change; run agents in parallel only on separate modules with agreed interfaces.
enforced_by: agent-rule
evidence:
  - https://www.anthropic.com/engineering/multi-agent-research-system
  - https://arxiv.org/abs/2503.13657
---

## What we found
Anthropic measured multi-agent runs at about 15x the tokens of a chat, and calls
most coding tasks a poor fit. The MAST study of 1,600+ multi-agent traces found
most failures come from coordination and verification, not model ability.

## What we changed
The engineering manager assigns files and interfaces before devs start, and
parallel work is limited to tasks that do not touch the same files.
