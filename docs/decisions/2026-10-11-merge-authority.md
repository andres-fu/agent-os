---
title: Who may merge a pull request, and how is it enforced?
status: decided
raised_by: stakeholder
date: 2026-10-11
decided_by: Andres Fuentes (stakeholder)
decided_on: 2026-10-11
---

## Context
- The stakeholder asked for an independent, principal-level reviewer whose
  approval is the real gate, so that routine work does not wait on them.
- The principal engineer's own review of this proposal
  ([andres-fu/agent-os#3](https://github.com/andres-fu/agent-os/pull/3#issuecomment-6112534173))
  found that the rule "changes to the rules need the stakeholder" is enforced by
  nothing (*observed*).
- Root cause (*observed*): agents open PRs and merge under the stakeholder's own
  GitHub account. GitHub cannot tell the two apart, so no GitHub rule (CODEOWNERS,
  required reviews) can block an agent without also blocking the stakeholder, and
  GitHub does not let anyone approve their own PR.
- Today's ruleset on `main` (*observed*, set 2026-10-11): PR required, the five
  gates required, no force pushes or deletions, 0 approvals.

## Options
| Option | What enforces the rules | Cost | Reversible? |
| --- | --- | --- | --- |
| A. Stakeholder merges everything | The agents' instructions only: they use the stakeholder's account, so GitHub cannot stop them merging | Stakeholder time on every PR | Yes |
| B. Agents merge routine PRs when the gates are green and the principal engineer approves; rules changes are left to the stakeholder by agent discipline | The agents' instructions only | One Opus review per PR | Yes |
| D. The principal engineer runs in CI from main (`principal-review` workflow); its verdict is a required `principal-engineer` status; on Approve, CI turns on auto-merge unless protected files changed; author agents are denied common merge commands by `.claude/settings.json` | GitHub, once the ruleset requires the `principal-engineer` status from GitHub Actions: no merge, by anyone without bypass, until CI's reviewer approves the latest commit. Claude Code's deny list only reduces the risk | One Opus review per push, on the stakeholder's plan | Yes |
| C. As B, but agents work under a separate bot GitHub account; CODEOWNERS marks the rules files, and a ruleset requires code-owner review on them | GitHub itself: a bot cannot approve its own PR, and only the stakeholder owns the rules files | One-time setup of a bot account; GitHub allows one free machine account per person | Yes |

## Recommendation
**A now, C next.** Keep merging yourself while the team is new: it costs about
30 seconds a PR and is the safest option today, though like B it rests on
agent discipline: nothing on GitHub stops an agent merging (*inferred* from the
shared account and the 0-approval ruleset). Move to C when the bot
account is set up; that makes the principal engineer's approval the real gate
for routine work and the rules truly protected. B is not recommended: it is the
"gate an agent could talk past" that the README promises against.

Either way:
- The principal engineer and security reviewer have no web tools and are told
  not to use the network from the shell. That is an instruction, not a sandbox:
  their shell could still reach the network or run `gh pr merge` (*observed* by
  the security review on PR #3). Enforcing it with Claude Code permission rules
  is a separate stakeholder decision (lesson L-0008).
- The merging actor is whoever holds merge rights on the PR: the stakeholder in
  A, the bot account (least privilege: contents and pull requests on this repo
  only) in C.
- A reviewer from a different vendor is added when Codex support lands.

## Decision
**D**, chosen by the stakeholder on 2026-10-11 ("just like humans you shouldn't
merge your own request"; "yes go ahead"), confirmed by merging the PR that adds
it.

- **The independent reviewer decides.** The `principal-review` workflow runs the
  principal engineer from main against the PR's diff at its head commit, as
  text, with read-only tools, and posts its verdict as the `principal-engineer`
  status.
- **CI merges.** On Approve, and only if no protected file changed
  (`tools/review/protected-paths.mjs`), the workflow turns on auto-merge for
  that exact commit as `github-actions[bot]`; GitHub merges once every required
  check is green.
- **The stakeholder merges rules changes**: the charter, `.claude/`, `.github/`,
  `docs/decisions/`, `docs/lessons/`, `tools/`, `package.json`, the lockfile and
  the scanner configs.
- **Authors never merge.**

## What enforces it
- **The ruleset.** `principal-engineer` is a required status check **with its
  source set to GitHub Actions**, so a status posted from anyone's own account
  does not count, and no merge (by the GitHub UI, `gh`, the API or auto-merge)
  can happen until CI's reviewer approves the latest commit, except a bypass
  merge by an account on the bypass list. See "What is enforced, by stage" for
  what this does and does not cover today.
- **`.claude/settings.json`** denies agent sessions `gh pr merge`, `gh api`, the
  GitHub merge and auto-merge tools, and edits to itself. A deny list matches
  command prefixes, so it **reduces** the risk; it does not prevent a
  determined agent (for example `bash -c`). The ruleset is what prevents it.

## Amendment 1 (2026-10-11): specs, escalations, and a bot account (D2)
Raised by the CI principal engineer on
[andres-fu/agent-os#8](https://github.com/andres-fu/agent-os/pull/8#issuecomment-6113269613):
specs were unprotected, so its Approve would have auto-merged a spec marked
"approved" without the stakeholder seeing it, and an `escalate` verdict gave the
stakeholder no clean way to merge after deciding. A first fix (an escalated PR
gets a green check) was rejected after the principal engineer and security
reviews of [andres-fu/agent-os#9](https://github.com/andres-fu/agent-os/pull/9):
it let any PR with no approval become mergeable, and text in a PR that steered
the reviewer to `escalate` would produce a green check.

Decided by the stakeholder on 2026-10-11 ("let's do D", then "D2"), confirmed
by merging the PR that adds this section:
- **`docs/specs/` is protected.** The stakeholder merges every spec; that merge
  is the recorded approval.
- **`escalate` fails the check**, like `request_changes`. Nobody can merge an
  escalated PR through the ruleset; the stakeholder answers it by merging
  through the ruleset's bypass.
- **Agents act as a bot account, `andres-fu-bot`** (a collaborator with write
  access). The stakeholder's account, `andres-fu`, is on the ruleset's bypass
  list. `.github/CODEOWNERS` gives every protected path to `@andres-fu`, and the
  ruleset requires code-owner review, so a bot PR touching them needs the
  stakeholder's approval.
- **Commits are authored as the stakeholder**, pushed by the bot, and merged by
  **rebase**, so the stakeholder keeps contribution credit (GitHub credits
  original authors on rebase) and the red-then-green history stays on `main`.

## What is enforced, by stage
| Stage | What enforces "agents never merge without approval" |
| --- | --- |
| Now: agents still act as `andres-fu` | Approved PRs: the ruleset (required `principal-engineer` from GitHub Actions). Escalated or rejected PRs: the ruleset blocks every merge; until the bypass exists, the stakeholder can only merge one by editing the ruleset. Approved PRs that change protected files: only the deny list and agent instructions, because agents hold the stakeholder's account. **Do not add `andres-fu` to the bypass list in this stage**: agents holding that account would bypass every check. |
| After the stakeholder connects Claude to `andres-fu-bot` and adds the ruleset changes below | GitHub. The bot cannot bypass the ruleset, cannot approve its own PRs, and cannot satisfy code-owner review on protected paths. Only `andres-fu` can merge an escalated PR or approve a protected one. |

Stakeholder setup still to do, in order:
1. Connect Claude's GitHub integration to `andres-fu-bot` (claude.ai/connect-github).
   Settings → General: confirm "Allow rebase merging" is on (auto-merge uses it).
2. Ruleset `Main`: add `andres-fu` to the bypass list; under "Require a pull
   request", tick "Require review from Code Owners".
3. Confirm on the first bot PR that its commits count on `andres-fu`'s
   contribution graph (*unknown* until seen: the rebase rule comes from older
   GitHub Enterprise documentation).

## Known limits
- Agents act under the stakeholder's GitHub account. For a PR the reviewer has
  approved but that changes protected files, an agent with that account could
  merge it by hand; only agent discipline and the deny list stop that.
  Option C (a separate bot account) closes this gap.
- The stakeholder's own account can merge anything after approval; that is
  their right.
- Prompt injection in a PR's diff or description could talk the reviewer into
  approving. It has no shell, web or write access, so it cannot act itself, but
  a wrong approval of a PR that changes no protected file **does auto-merge**
  once the gates pass. Protected files still need the stakeholder, and
  summaries carrying long encoded strings are withheld
  (`tools/review/check-summary.mjs`). Revisit if the repo goes public.
- Rebase merging puts every commit of a PR on `main`, including the
  deliberately failing "red" test commits. That keeps the test-first history
  for later analysis, at the cost of `git bisect` stopping on commits whose
  tests fail by design.
- Merges made by `github-actions[bot]` do not trigger workflows on `main`; the
  PR already passed every required check.
- The reviewer is the same model family as the authors; a reviewer from a
  different vendor comes with Codex support.
