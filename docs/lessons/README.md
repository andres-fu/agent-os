# Lessons ledger

What our agents have learned, each with the evidence that it really happened.
The [index](INDEX.md) is generated; read it before planning.

## Rules
- **No evidence, no lesson.** Every lesson links an https source or a
  `commit:<sha>`. CI rejects lessons without one.
- **A lesson changes behaviour.** Its `rule` is one sentence an agent can follow.
- **Adopted means enforced.** An adopted lesson names what enforces it: a CI
  `gate`, a `hook`, or an `agent-rule` in CLAUDE.md or an agent file.
- **Ids are per project.** `L-0001` in two projects are two lessons.

## Commands
```bash
node tools/lessons/lessons.mjs check                 # validate this project's lessons
node tools/lessons/lessons.mjs index                 # rebuild docs/lessons/INDEX.md
node tools/lessons/lessons.mjs index ../a/docs/lessons ../b/docs/lessons --out all-lessons.md
```
The last form combines several projects into one index: the shared memory across
everything you build.
