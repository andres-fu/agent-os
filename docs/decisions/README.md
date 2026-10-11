# Decisions: the meeting room

This folder is where the stakeholder and the team meet. Agents use `/escalate` to
open a decision request; the stakeholder answers in the file and sets
`status: decided`. Nothing is decided in a chat that disappears: the files are
the record, and they are reviewed in pull requests like code.

To see what is waiting on you:

```bash
grep -l "status: awaiting-decision" docs/decisions/*.md
```
