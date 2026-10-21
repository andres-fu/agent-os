---
id: L-0015
title: Unit tests share the code's assumptions about other systems; only a real run catches them
date: 2026-10-21
project: agent-os
kind: mistake
status: proposed
rule: Before a change that depends on an external system (an API, a shell, a CI action, a tool's file format) is called done, run it once against the real system and put what you saw in the PR's receipt.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/issues/24
  - https://github.com/andres-fu/agent-os/issues/26
  - https://github.com/andres-fu/agent-os/issues/28
  - commit:349a7ac
  - commit:fcf958f
  - commit:8d7fad2
---

## What happened
The GitHub App rollout was built test-first, under dope-tdd, with every test
seen failing and the modules PROVEN. Even so, the first real run of each piece
failed:
- **#24:** real installation tokens are 383 characters and contain `.` and
  `-`. The code and its tests both assumed the older short format.
- **#26:** a bare `GH_TOKEN=` line in Claude Code's env file isn't exported in
  the Bash tool, so `gh` silently used the stakeholder's login. The first fix,
  an `export` line, made the PowerShell tool ignore the whole file. Only
  headless probes against real Claude Code showed either.
- **#28:** `claude-code-action` refuses runs started by a bot. It showed only
  when the App opened its first real PR.

Each test was written from the same assumption as the code, so each one went
red, then green, and was still wrong.

## What we changed
- Tests now exercise the real consumer where one exists: a real `sh` sources
  the env file and a child process checks the variable.
- Each fix's PR records the live run.
- The remaining undocumented behaviour has a re-probe issue (#31).
