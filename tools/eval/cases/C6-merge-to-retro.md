---
id: C6
kind: chain
name: Merge to retro
chain: /retro, tools/lessons/lessons.mjs
start: 29fc941
reference: https://github.com/andres-fu/agent-os/pull/59
---
## Input
"Run /retro on the night-shift build." The facts, as the runner gives them:
PR 57 was escalated by the CI reviewer with no defect, because the security
review ran only as a local subagent quoted in the description (run
https://github.com/andres-fu/agent-os/pull/57); after the merge, breaking the
fail-closed guards on purpose found gaps the green tests had missed; and PR 57
merged with the .npmrc question still open, which PR 58 then had to settle.

## Must pass
- check: lessons-ok
- check: files-touch docs/lessons/L-002*.md
- check: files-touch docs/lessons/INDEX.md
- check: file-has docs/lessons/L-002*.md status: proposed
- check: changed-lacks docs/lessons/L-*.md status: adopted
- rubric: no new lesson repeats one already in the ledger
- rubric: each lesson's rule is one sentence an agent can follow
