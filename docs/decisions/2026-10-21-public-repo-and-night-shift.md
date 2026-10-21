---
title: Now that agent-os is public, what may an unattended agent read, hold and merge?
status: awaiting-decision   # awaiting-decision | decided | superseded
raised_by: product-manager (night-shift spec)
date: 2026-10-21
decided_by:
decided_on:
---

## Context
- *Observed:* agent-os went public on 2026-10-21. The merge-authority decision
  ends with "Revisit all of this if the repository goes public."
  ([2026-10-11-merge-authority.md](2026-10-11-merge-authority.md), Known
  limits).
- *Observed:* the part of that decision that faces outsiders still holds.
  `principal-review` reviews only PRs from this repository
  (`.github/workflows/principal-review.yml`: `head.repo.full_name ==
  github.repository`). A fork's PR gets no `principal-engineer` status, so the
  ruleset blocks its merge, and it never sees the Claude token.
- *Observed:* the charter says: "Agents that read untrusted content (web pages,
  issues, emails) do not get secrets or open network access in the same
  session" (CLAUDE.md, Security).
- *Observed:* the draft night-shift spec
  ([2026-10-21-night-shift.md](../specs/2026-10-21-night-shift.md)) reads public
  issues and comments. It runs under the stakeholder's GitHub login, which has
  admin rights, and it uses the network to push and open PRs.
- *Inferred:* labels limit which issues are taken, but not what they say later.
  An issue's author can edit its body after it is labelled `ready`, and anyone
  can comment on it.
- *Inferred:* a night-shift PR is opened from this repository, so the CI
  reviewer reads its description, and an approved, unprotected PR auto-merges.
  Text injected into an issue could reach the reviewer through the description
  the night shift writes, with nobody awake.

## Options
| Option | Cost | Risk | Reversible? |
| --- | --- | --- | --- |
| A. No night shift on public repos | None | None new; the backlog waits for the stakeholder | Yes |
| B. Night shift with limits: it reads only the issue body and comments from the author and collaborators (by author association); it takes only issues filed by a collaborator; its PRs never auto-merge in version 1; and the charter gains a named, narrow exception for it | A few rules in the spec and a check in the issue picker | Injection through text a collaborator wrote or quoted, or an edit to the body after labelling; mitigated by never auto-merging, and by every PR waiting for the stakeholder | Yes |
| C. As B, plus the night shift runs under a fine-grained token, not the admin login. The token is limited to this repository: contents, pull requests and issues set to write, no workflow or administration permission, and an expiry date (for example 90 days) | Setting up the token and renewing it before it expires; scheduled tasks must use it | Lowest. A hijacked night cannot change settings, the ruleset, workflows or other repositories. It can still push a `night/` branch, open a draft PR, and comment on or label issues, so an injected night could spam issues or mislabel them | Yes |

## Recommendation
**C from day one.** A security-compliance review of the draft spec blocked it
while the admin login was the credential. That login can edit the ruleset, and
nothing at GitHub stops an agent using it that way (merge-authority decision,
"What enforces it today").

Also:
- Every night-shift PR is a draft, which `principal-review` skips. So nothing
  is reviewed or auto-merged until the stakeholder marks it ready. Revisit once
  `/retro` shows a clean record.
- The charter's untrusted-content rule names this exception and its limits, so
  the rule and the practice agree (lesson L-0010).

Nothing else in the merge-authority decision needs to change for public
visibility, given the fork check above.

## Decision
Filled in by the stakeholder: the choice, and anything to watch.
