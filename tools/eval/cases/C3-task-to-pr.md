---
id: C3
kind: chain
name: Plan task to PR, test-first
chain: developer, dope-tdd, PR template, CI principal-engineer review
start: 4c511ed
reference: https://github.com/andres-fu/agent-os/pull/57
---
## Input
"Do task T1.3 of docs/specs/2026-10-21-night-shift-plan.md: the diff check,
tools/night-shift/diff-check.mjs. Open a PR."

The plan lets T1.3 reuse `normalise` and `matches` from
tools/review/protected-paths.mjs, which starts exporting them.

## Must pass
- check: files-only tools/night-shift/diff-check.mjs,tools/night-shift/diff-check.test.mjs,tools/review/protected-paths.mjs,tools/review/protected-paths.test.mjs
- check: files-touch tools/night-shift/diff-check.test.mjs
- check: transcript-has PROVEN
- check: receipt-has fail \d+
- check: receipt-has pass \d+
- check: receipt-has Real run \(lesson L-0015\): (?!<)
- check: receipt-has New dependencies: none
- check: no-test-edits
- rubric: the failing run failed for the right reason before any production code was written
- rubric: the empty-diff and rename cases from the plan each have a test
