---
name: plan
description: The engineering manager's procedure for turning an approved spec into a plan - approach, contracts, one-PR tasks with file ownership, AC coverage, enforcers, risks and routed reviews - checked by tools/plan/check.mjs before it is handed on. Use when planning an approved spec.
allowed-tools: Read, Glob, Grep, Bash(node tools/plan/check.mjs:*)
---

# Plan an approved spec

The standard procedure for the engineering-manager role
(`.claude/agents/engineering-manager.md`). The plan is done only when
`node tools/plan/check.mjs <plan>` prints `ok:`.

1. **Refuse an unapproved spec.** Open the spec. If its frontmatter doesn't say
   `status: approved`, stop: `BLOCKED: the spec is not approved`.
2. **Read before you plan:** `CLAUDE.md`, `docs/lessons/INDEX.md`,
   `docs/landscape.md`, `docs/decisions/`, and the code the spec touches.
   Reuse before you build.
3. **Write `docs/specs/<spec>-plan.md`** with this frontmatter:

   ```
   ---
   title: Plan for <spec title>
   spec: docs/specs/<spec>.md
   status: draft
   classification: trivial | non-trivial
   owner: engineering-manager
   date: YYYY-MM-DD
   ---
   ```

   Then these sections, in this order:
   - **`## Classification and review`**: *trivial* means one small task and no
     new interface. A *non-trivial* plan names `principal-engineer`, who reviews
     it before coding. Always write "Security review: yes / no / not
     triggered", against the `CLAUDE.md` trigger list; yes means
     `security-compliance` reviews it before coding.
   - **`## Approach`**: the approach, then "Rejected: <alternative>, because
     <reason>".
   - **`## Interfaces and contracts`**: types, endpoints, schemas and file
     formats between parts, and the decisions developers must not change.
   - **`## Tasks`**: a table with the columns `Task | Wave | Files it may change
     | ACs | First failing test`.
     - Each task is one PR's worth of work.
     - Tasks in the same wave run in parallel and **share no file**.
     - At most 3 tasks per wave.
     - A plan spanning several PRs has one table per PR, under `### PR n`.
   - **`## AC coverage`**: every acceptance criterion → the task and test
     file that covers it.
   - **`## What enforces each protection (L-0010)`**: each protection and
     its enforcer: a gate, a hook, a script, or "instruction only".
   - **`## Risks`**: each risk, and what would make you escalate.
4. **Estimate in ranges** where the spec asks for timing, and say what would
   change them.
5. **Check it:** run `node tools/plan/check.mjs docs/specs/<spec>-plan.md`. Fix
   every problem it lists, and run it again. After three runs that still fail,
   stop: `BLOCKED: <what the checker keeps reporting>`.
6. **Hand off.** Quote the checker's `ok:` line in your hand-off note
   (`docs/team/roles.md`). Next: `principal-engineer` for a non-trivial plan,
   `security-compliance` if triggered, then a developer per task.

Anything hard to undo that the plan would decide goes through `/escalate`
first.
