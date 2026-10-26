---
id: L-0022
title: A merge does not answer the questions a PR left open; recording it as a decision invents one
date: 2026-10-26
project: agent-os
kind: mistake
status: proposed
rule: When a PR leaves a question for the stakeholder and they merge without answering it, record the question as still open and ask it again; never record the merge as their decision.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/57
  - https://github.com/andres-fu/agent-os/pull/58
---

## What happened
PR 57 left one question for the stakeholder: should the diff check also forbid
`.npmrc`, `.mcp.json` and `.claude.json`? The CI review escalated it as well.
The stakeholder merged PR 57, and the agent then recorded "merged without
adding them" as the stakeholder's decision, in the project notes and in its
reply.

The stakeholder asked whether that would be a problem. They had not decided
to leave the files out. When asked directly, they had both protected (PR 58).

## What we changed
The project note now says the PR 57 merge did not decide the question. PR 58
protects both files.
