---
id: L-0012
title: A spec that handles personal data needs a security review; the general reviewer misses its gaps
date: 2026-10-11
project: agent-os
kind: practice
status: proposed
rule: A spec, plan or PR that collects, stores or sends personal data gets a security-compliance review before the stakeholder merges it, even when the principal engineer finds no problem.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/8#issuecomment-6113686596
  - https://github.com/andres-fu/agent-os/pull/8
  - commit:fbc0515
---

## What happened
The CI principal engineer reviewed the `/onboard` spec at 52fce99, which
covers children's, health and ID data. It called the content sound and
escalated only on the merge path. The stakeholder asked for a
security-compliance review of the same commit. That review blocked on two real
gaps:
- a "don't know" answer to the sensitive-data question let the build go ahead;
- nothing stopped real personal data in the intake from being committed.

Both were closed in fbc0515 (AC-17, AC-18), before any code was written.

## What we changed
`CLAUDE.md` already lists personal data as a security trigger, and the
one-review rule adds `security-compliance` when a trigger is hit. This lesson
records why that rule is worth keeping for specs, not just code: fixing the
spec cost two acceptance criteria, while fixing the built tool would have cost
a PR. Adopting it as an `agent-rule` means no wording change; a `gate` would
need CI to detect personal-data specs, which is not worth building yet.
