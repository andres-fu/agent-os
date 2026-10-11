---
name: retro
description: Record a lesson learned in the evidence-backed lessons ledger after a PR merges, a task fails, or an agent makes a mistake. Use when the user says retro, lesson, "we learned", or after something went wrong.
---

# Retro: add a lesson to the ledger

A lesson is only worth keeping if it is true and it changes behaviour.

1. Find the evidence first: the PR, CI run, commit (`commit:<sha>`) or source
   (https link). **No evidence, no lesson.** If you only have a hunch, tell the
   user and stop.
2. Read `docs/lessons/INDEX.md`. If the lesson already exists, add the new
   evidence to that file instead of creating a duplicate.
3. Copy `docs/lessons/_template.md` to `docs/lessons/L-<next number>-<slug>.md`.
   Fill every field. `rule` is one sentence an agent can follow.
4. Set `status: proposed`. Only the stakeholder adopts a lesson. Adopting means
   saying what enforces it: a `gate` (CI), a `hook`, or an `agent-rule` (a line
   in CLAUDE.md or an agent file).
5. Run `node tools/lessons/lessons.mjs check` and `node tools/lessons/lessons.mjs index`.
6. Show the user the lesson and ask whether to adopt it and how to enforce it.
