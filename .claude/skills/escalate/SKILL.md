---
name: escalate
description: Ask the human stakeholder to decide something major (scope, cost, security, public API, data model, anything hard to undo). Writes a decision request and waits.
---

# Escalate a decision to the stakeholder

1. Copy `docs/decisions/_template.md` to
   `docs/decisions/<yyyy-mm-dd>-<slug>.md`.
2. Fill it in: the question, 2–3 options with their cost, risk and
   reversibility, and your recommendation with its reasoning. Label facts
   *observed* (with links) and guesses *inferred*.
3. Set `status: awaiting-decision`.
4. Tell the user, in three lines or fewer: the question, your recommendation,
   and the file to read.
5. **Stop work that depends on the decision** until the file says
   `status: decided`. Keep working on anything independent of it.
