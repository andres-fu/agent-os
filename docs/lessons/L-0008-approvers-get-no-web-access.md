---
id: L-0008
title: An agent whose verdict can allow a merge must not read untrusted content
date: 2026-10-11
project: agent-os
kind: practice
status: proposed
rule: Reviewers that approve or block merges get no web tools; outside research happens in a separate session that cannot approve, and lands as reviewed data in docs/landscape.md.
enforced_by: agent-rule
evidence:
  - https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112534173
  - https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
  - https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112560146
---

## What happened
The first draft of the principal engineer role gave it WebSearch and WebFetch,
and its Approve verdict was meant to allow a merge. Its own review flagged this:
a web page could carry text that steers the verdict. That is the "lethal
trifecta" (untrusted input, access to private data, and the power to act)
applied to code review.

## What we changed
The principal engineer and security reviewer have no web tools, and are told
not to use the network from the shell. Build-or-reuse checks read
`docs/landscape.md`, which is written by research sessions with no approval
power and reviewed in PRs.

## Known gaps
- The shell rule is an instruction only; their `Bash` tool can still reach the
  network (found by the security review on PR #3). A permission deny list would
  make it a hook-level rule.
- `docs/landscape.md` is written from web research, so it is itself a path for
  injected text. It is reviewed in PRs and read as data.
