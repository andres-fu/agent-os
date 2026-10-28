---
id: C1
kind: chain
name: Goal to spec
chain: product-manager, /spec, tools/spec/check.mjs
start: 8474556
reference: https://github.com/andres-fu/agent-os/pull/8
---
## Input
The stakeholder's goal, as given on 2026-10-11: "I want a plain-language
kickoff for a new project. Someone who is not technical answers a few
questions about whose problem we are solving, what a good result looks like
and what data is at stake, and the team adapts to it. Call it /onboard."

The agent may ask the stakeholder questions. The runner answers them from the
approved spec's Problem and Goal sections (docs/specs/2026-10-11-onboard.md at
85bf2a0) and says "I don't know" to anything else.

## Must pass
- check: spec-ok docs/specs/2*.md
- check: frontmatter docs/specs/2*.md status draft
- check: files-only docs/specs/**
- check: count-at-least 3 \?\s*$
- rubric: questions were asked one at a time, before the spec was written
- rubric: every assumption is labelled assumption and every fact observed with its source
