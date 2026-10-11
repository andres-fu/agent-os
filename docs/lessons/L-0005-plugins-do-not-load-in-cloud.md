---
id: L-0005
title: Plugins do not load in Claude Code cloud sessions
date: 2026-10-09
project: dope-tdd
kind: tool-quirk
status: adopted
rule: Define the team in committed repo files (CLAUDE.md, .claude/agents, skills, CI), never only in plugins or ~/.claude.
enforced_by: agent-rule
evidence:
  - https://github.com/andres-fu/dope-tdd/blob/main/docs/debt.md
---

## What happened
Cloud sessions load the repo's CLAUDE.md, agents, skills and hooks, but not user
or repo-declared plugins. Dope TDD's in-session guard therefore does not run
there.

## What we changed
This template keeps every role and rule in the repo, and the hard gates in CI,
so the team behaves the same on Windows, Mac and cloud.
