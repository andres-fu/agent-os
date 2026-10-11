---
id: L-0003
title: An old Claude Code on the PATH runs agents with no mods, silently
date: 2026-10-10
project: dope-tdd
kind: tool-quirk
status: adopted
rule: Check `claude --version` before launching agents; refuse to start below the version the mods need.
enforced_by: gate
evidence:
  - https://github.com/andres-fu/dope-tdd/commit/1489bfcce54dae264447ec5f2b5d5960563aaba8
---

## What happened
Preparing a pull request, a stray Claude Code 2.1.12 earlier on the PATH ran an
agent with no Dope TDD loaded and no warning.

## What we changed
The launcher refuses an older Claude Code before spending anything.
