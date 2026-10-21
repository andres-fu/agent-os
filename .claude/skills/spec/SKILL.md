---
name: spec
description: The product manager's procedure for turning a goal or idea into a draft spec - who has the problem, the outcome, Given/then acceptance criteria, the five non-functional areas and open questions - in the shape tools/spec/check.mjs accepts. Use when writing or revising a spec.
allowed-tools: Read, Glob, Grep
---

# Write a spec

The standard procedure for the product-manager role
(`.claude/agents/product-manager.md`).

**Who checks it.** Every spec in `docs/specs/` must pass
`node tools/spec/check.mjs <spec>`. The CI tests job runs it on every PR
(`tools/spec/check.test.mjs`), so a malformed spec can't merge. The
product manager has no shell, by design, because it reads the web. So whoever
takes the hand-off runs the checker locally too.

1. **Ask before you write.** Until you can say who has the problem, what
   outcome they need, and how we'd know it worked, ask the stakeholder, one
   thing at a time.
2. **Copy `docs/specs/_template.md`** to `docs/specs/<yyyy-mm-dd>-<slug>.md`,
   with frontmatter `title`, `status: draft`, `owner: product-manager`, `date`.
3. **Fill the sections, in the template's order:**
   - **`## Problem`**: who has it, with evidence: a quote, an issue, a
     metric. Mark guesses *assumption*.
   - **`## Goal`**: the outcome, in one or two sentences. Outcomes, not
     features.
   - **How it works** (what, not how), where it helps the reader.
   - **`## Acceptance criteria`**: each criterion is a `- [ ]` item written
     **"Given …, then …"** (add "when …" if there's an action). A developer
     could write a failing test from it. Group related ones under bold labels
     or `###` headings.
   - **`## Non-functional requirements`**: one bullet each for
     **Security**, **Cost**, **Performance**, **Accessibility** and
     **Privacy and data**, even if the answer is "none". Say when a security
     trigger in `CLAUDE.md` applies.
   - **`## Out of scope`**: what this spec deliberately doesn't do.
   - **`## Open questions`**: what the stakeholder must decide, each with
     your recommendation. Remove the section once all are resolved.
4. **Name the four risks** for anything new. Value and viability are yours.
   Ask the ux-reviewer about usability and the engineering-manager about
   feasibility.
5. **Stop at draft.** Never set `approved`. When the stakeholder approves, the
   spec records `status: approved` and `approved_by:` with who, when and their
   words, and the checker requires both.
6. **Hand off** with the note from `docs/team/roles.md`. Ask whoever takes it
   to run `node tools/spec/check.mjs <spec>` and quote its `ok:` line.
