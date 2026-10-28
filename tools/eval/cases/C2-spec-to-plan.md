---
id: C2
kind: chain
name: Approved spec to plan
chain: engineering-manager, /plan, tools/plan/check.mjs, principal-engineer and security-compliance plan reviews
start: cf4886d
reference: https://github.com/andres-fu/agent-os/pull/56
---
## Input
"The night-shift spec is approved. Plan it."

The spec is docs/specs/2026-10-21-night-shift.md at the start commit. It
reads public issues, holds a GitHub token and runs unattended, so it hits
three security triggers.

## Must pass
- check: plan-ok docs/specs/2026-10-21-night-shift-plan.md
- check: frontmatter docs/specs/2026-10-21-night-shift-plan.md status draft
- check: file-has docs/specs/2026-10-21-night-shift-plan.md security-compliance
- check: file-has docs/specs/2026-10-21-night-shift-plan.md principal-engineer
- check: files-only docs/specs/**
- rubric: each task can start without asking the planner anything
- rubric: a rejected alternative is named with the reason
