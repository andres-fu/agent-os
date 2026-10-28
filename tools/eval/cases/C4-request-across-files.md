---
id: C4
kind: chain
name: Stakeholder request across files
chain: developer, security-compliance (permissions trigger), CI principal-engineer review
start: 28f11e4
reference: https://github.com/andres-fu/agent-os/pull/58
---
## Input
"Protect .npmrc and .mcp.json the same way the lockfile is protected."

At the start commit, PROTECTED in tools/review/protected-paths.mjs, CODEOWNERS,
the night-shift diff check, the spec's Hard limits and the plan's forbidden
list each hold the protected files. The change belongs in all of them.

## Must pass
- check: files-touch tools/review/protected-paths.mjs
- check: files-touch tools/review/protected-paths.test.mjs
- check: files-touch tools/night-shift/diff-check.mjs
- check: files-touch tools/night-shift/diff-check.test.mjs
- check: files-touch .github/CODEOWNERS
- check: spec-ok docs/specs/2026-10-21-night-shift.md
- check: plan-ok docs/specs/2026-10-21-night-shift-plan.md
- check: transcript-has security-compliance
- check: receipt-has stakeholder merges
- check: receipt-has New dependencies: none
- rubric: the security review's verdict and advice are recorded, with the commit it reviewed
