---
title: Should names, birthdates, family or school details stop an /onboard build, or only warn?
status: decided
raised_by: security-compliance (advice on the /onboard plan)
date: 2026-10-13
decided_by: Andres Fuentes (stakeholder)
decided_on: 2026-10-13
---

## Context
The `/onboard` spec stops the build for highly sensitive data (children,
diagnoses, test scores, disability or special education, health, payments, ID
numbers). Security review of the plan asked whether names + school + family,
without children, should stop it too
([andres-fu/agent-os#11](https://github.com/andres-fu/agent-os/pull/11)).
*Observed:* today these answers give `READY` with no warning.

## Options
| Option | Cost | Risk | Reversible? |
| --- | --- | --- | --- |
| A. Block, like highly sensitive data | A decision for every such project | Blocks routine document work that must name real people | Yes |
| B. Warn, never block | One note line | Relies on the person and their organisation's rules | Yes |

## Recommendation
The coordinating agent recommended A.

## Decision
**B. Warn, never block.** The stakeholder, 2026-10-13: "it should just warn
you". The first intended user creates documents that include real names, and
is allowed to.

`status` shows a `Note:` line, and the skill passes it on in plain words. Real
personal details are still never typed into the intake, which is committed;
validate and the AC-10 detector are unchanged. Highly sensitive data still
blocks.
