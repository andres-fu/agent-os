---
id: L-0013
title: Relaxing a personal-data rule is a security trigger, even when it adds no data handling
date: 2026-10-13
project: agent-os
kind: mistake
status: proposed
rule: A change that loosens how personal data is blocked, warned about or checked gets a security-compliance review, even when it stores, logs and sends nothing new.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/14#issuecomment-6137721793
  - https://github.com/andres-fu/agent-os/pull/14
---

## What happened
The stakeholder decided that names, birthdates, family and school details
should warn instead of block. The coordinating agent implemented it and skipped
security review, reasoning that the change only added a warning. The CI
principal engineer requested changes: personal data is on the trigger list, and
"when in doubt, it is triggered". The review that followed passed, and the
principal engineer's advice found a real wording problem: a "that is fine" note
shown just before a stop.

## What we changed
#14 got its security review, and the note is now hidden while the build is
blocked. Adopting this lesson as an `agent-rule` would add one clause to the
trigger list in `CLAUDE.md`: "including changes that relax a personal-data rule".
