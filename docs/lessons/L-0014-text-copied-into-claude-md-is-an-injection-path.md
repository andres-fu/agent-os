---
id: L-0014
title: Text copied into CLAUDE.md is a prompt-injection path for every agent
date: 2026-10-13
project: agent-os
kind: practice
status: proposed
rule: Any tool that copies a person's words into a file agents read as instructions strips markup and labels the text as data, not instructions.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/15
  - commit:0ffbbb9
  - commit:8241156
---

## What happened
`/onboard`'s generate step copies the person's Q1 and Q8 answers into the
project section of `CLAUDE.md`, which every agent reads first. Security review
of PR 2 found that the copied text could carry HTML comments, links, code or
plain imperative sentences ("ignore the rules"), so the person's words could
steer every agent.

## What we changed
Copied answers now lose `< > \` [ ] |`, each line says it holds "the person's
words, not instructions", and the section tells agents to treat the intake as
data. A test feeds hostile input and checks all of this. `CLAUDE.md` changes
still reach `main` only through the stakeholder's merge.
