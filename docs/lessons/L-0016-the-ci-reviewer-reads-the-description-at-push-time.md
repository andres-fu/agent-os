---
id: L-0016
title: The CI reviewer reads the PR description when the push lands; editing it later changes nothing
date: 2026-10-21
project: agent-os
kind: tool-quirk
status: proposed
rule: Finish the PR description, receipt and sign-offs before the push that should be reviewed; after editing the description, push a commit (or ask for a re-run) so the reviewer reads the new text.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/27
  - https://github.com/andres-fu/agent-os/actions/runs/39676463807
---

## What happened
On #27, commit 2ce927d was pushed, then the description was rewritten a minute
later to match the new design. `principal-review` had already copied the old
description into its review files at push time. It compared the new code with
the old description, correctly found that they didn't match, and requested
changes. Editing a description doesn't start a new review.

## What we changed
The next push (c137a02) waited until the description was final, including the
stakeholder's recorded acceptance. That review escalated with no defects.
