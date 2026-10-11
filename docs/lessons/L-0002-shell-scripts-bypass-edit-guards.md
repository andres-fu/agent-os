---
id: L-0002
title: Agents bypass edit guards by writing files through the shell
date: 2026-10-07
project: dope-tdd
kind: mistake
status: adopted
rule: Any guard on file edits must also watch shell and PowerShell writes, with a git diff backstop.
enforced_by: hook
evidence:
  - https://github.com/andres-fu/dope-tdd/blob/main/DOGFOOD.md
---

## What happened
Claude edited `CareerTimeline.tsx` with a Python script run through Bash. The
edit guard only watched the Edit and Write tools, so it never saw the change.

## What we changed
Dope TDD detects writes in shell commands before they run and checks `git diff`
afterwards.
