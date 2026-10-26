---
title: Now that agent-os is public, what may an unattended agent read, hold and merge?
status: decided   # awaiting-decision | decided | superseded
raised_by: product-manager (night-shift spec)
date: 2026-10-21
decided_by: Andres Fuentes (stakeholder)
decided_on: 2026-10-21
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

- *Observed:* the stakeholder answered part of this in the session on
  2026-10-21: "I should handle all issues from people outside us - I can be
  that final gate." Outside issues reach the night shift only after the
  stakeholder re-files them as their own. That removes outsiders as authors of
  anything the night shift reads. It does not settle the credential question
  below.

## Options
| Option | Cost | Risk | Reversible? |
| --- | --- | --- | --- |
| A. No night shift on public repos | None | None new; the backlog waits for the stakeholder | Yes |
| B. Night shift with limits: it reads only the issue body and comments from the author and collaborators (by author association); it takes only issues filed by a collaborator; its PRs never auto-merge in version 1; and the charter gains a named, narrow exception for it | A few rules in the spec and a check in the issue picker | Injection through text a collaborator wrote or quoted, or an edit to the body after labelling; mitigated by never auto-merging, and by every PR waiting for the stakeholder | Yes |
| C. As B, plus the night shift runs under a fine-grained token, not the admin login. The token is limited to this repository: contents, pull requests and issues set to write, no workflow or administration permission, and an expiry date (for example 90 days) | Setting up the token and renewing it before it expires; scheduled tasks must use it | Lowest. A hijacked night cannot change settings, the ruleset, workflows or other repositories. It can still push a `night/` branch, open a draft PR, and comment on or label issues, so an injected night could spam issues or mislabel them | Yes |
| D. As B, with a GitHub App (`agent-os[bot]`) as the agents' identity. The App is installed on this repository only, with contents, pull requests and issues set to write and no workflow or administration permission. Agents get installation tokens that expire after an hour. Commits keep the stakeholder as author, with `Co-Authored-By: Claude`, so credit and ownership stay with the stakeholder; the App only pushes and opens PRs. The stakeholder's own GitHub and git credentials are kept out of agent sessions | About 45 minutes: create the App and store its private key where agent sessions cannot read it, plus a small script that mints a token. Agent sessions and the scheduled task use only that token | Lowest. GitHub can tell agents from the stakeholder, so the stakeholder can approve, CODEOWNERS can be turned on, and the stakeholder can have a one-click bypass for escalated merges. A hijacked session is capped at the App's permissions for an hour | Yes: uninstall the App |

## Recommendation
**D: a GitHub App, with the stakeholder kept as commit author.** The
stakeholder chose this in the session on 2026-10-21 ("why not just go for C",
meaning the App). They want credit and control of the code to stay theirs,
and agents to be separate actors that GitHub can limit.

Why it matters:
- A security-compliance review of the draft spec blocked it while the admin
  login was the credential. That login can edit the ruleset, and nothing at
  GitHub stops an agent using it that way (merge-authority decision, "What
  enforces it today").
- *Inferred:* a token or App limits only what an agent is *given*. Agent
  sessions run as the stakeholder's own operating-system user, so they could
  still reach the stakeholder's stored `gh` login or git credentials. D works
  only if those are kept out of agent sessions too, for example:
  - agents get just the App token;
  - the stakeholder's own login lives in a credential store that asks before
    use;
  - or the scheduled task runs as a separate operating-system user.

  The plan for D must name which one.
- With D in place, the merge-authority decision can move from instructions to
  enforcement: the stakeholder can approve PRs, CODEOWNERS can be turned on,
  and the stakeholder can bypass the ruleset for escalated merges. That is a
  follow-up revision of that decision.

If D slips, use C as a stopgap, never the admin login.

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

**Decided so far, in the session on 2026-10-21** (recorded by the agent, with
the stakeholder's words; merging this record is the stakeholder's
confirmation):
- **Credential: option D, a GitHub App.** "yes please - why not just go for
  C?" (the App), then "let's work on setting up the app". The stakeholder stays
  commit author. Built in `tools/github-app/`.
- **Outside issues:** "I should handle all issues from people outside us - I
  can be that final gate."

- **The charter exception: allowed, with limits.** Asked in the session: "may
  an unattended agent read your ready-labelled issues while holding the App's
  token (a named exception to the charter's untrusted-content rule), with the
  limits in the spec?" Answer: "Allow, with limits". `CLAUDE.md`'s Security
  section now names the exception. The limits:
  - the App's token only, never the stakeholder's login;
  - only issues whose `ready` label the stakeholder's own account added;
  - only collaborators' text reaches the agent, and an issue edited after
    labelling is refused;
  - every night-shift PR is a draft, which `principal-review` skips;
  - a separate operating-system user for the night shift is still to come
    (#32).

**What this does and doesn't put in force.** The exception takes effect only
once the night-shift spec is approved and its enforcers are built and tested,
as `CLAUDE.md` says. Until then the base rule applies in full. Even then, not
every limit is enforced by code: no network beyond GitHub, no secrets, and
never marking a PR ready are instructions, as the spec's Hard limits table
says.

**Not decided by this:** approving the night-shift spec itself. It stays
`draft` until the stakeholder approves it.

**Follow-up, 2026-10-26: the spec is approved** (PR #55). The stakeholder's
words: "Approve the night-shift spec as recommended: no auto-merge in v1,
close question 2 as decided, dope-tdd required, my judgement for small
enough, cap 3." What that means for the limits above:
- **No auto-merge while a night PR is a draft.** Once the stakeholder marks
  it ready, the normal rules apply: an approved PR that changes no protected
  file auto-merges. Marking ready is the stakeholder's go-ahead, so read the
  diff first. The security re-review proposed also stopping auto-merge after
  ready. The stakeholder declined: "Remove the no-auto-merge-after-ready
  limit".
- **At most three night PRs waiting.** A night PR is one from this
  repository's `night/` branch, opened by the App (lesson L-0019).

The exception still takes effect only once the enforcers are built and
tested. The plan names how the stakeholder's own `gh` login is kept out (#32)
before the night shift is turned on.

**To watch:** night PRs sent back for changes (`/retro`), any `ready` label
not added by the stakeholder (the morning brief), and #32.
