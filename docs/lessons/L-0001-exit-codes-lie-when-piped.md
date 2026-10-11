---
id: L-0001
title: Exit codes lie when test output is piped
date: 2026-10-08
project: dope-tdd
kind: mistake
status: adopted
rule: Judge a test run by the runner's own summary line, never by the shell's exit code.
enforced_by: gate
evidence:
  - https://github.com/andres-fu/dope-tdd/blob/main/DOGFOOD.md
---

## What happened
In a headless run, an agent piped `vitest run` through `tail -30`. The pipe
returned tail's exit code, so a failing run was logged as a pass.

## What we changed
Dope TDD reads the runner's summary ("Tests 1 failed") instead of the exit code.
