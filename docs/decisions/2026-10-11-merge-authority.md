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
- **The ruleset, and only once it is set up.** `principal-engineer` must be a
  required status check **with its source set to GitHub Actions**. Then a status
  posted from anyone's own account does not count, and no merge (by the GitHub
  UI, `gh`, the API or auto-merge) can happen until CI's reviewer approves the
  latest commit. This is the real gate.
- **`.claude/settings.json`** denies agent sessions `gh pr merge`, `gh api`, the
  GitHub merge and auto-merge tools, and edits to itself. A deny list matches
  command prefixes, so it **reduces** the risk; it does not prevent a
  determined agent (for example `bash -c`). The ruleset is what prevents it.

## Known limits
- Agents act under the stakeholder's GitHub account. For a PR the reviewer has
  approved but that changes protected files, an agent with that account could
  merge it by hand; only agent discipline and the deny list stop that.
  Option C (a separate bot account) closes this gap.
- The stakeholder's own account can merge anything after approval; that is
  their right.
- Prompt injection in a PR's diff or description could talk the reviewer into
  approving. It has no shell, web or write access, so the worst case is a wrong
  approval; the gates and the protected-paths rule still apply, and summaries
  carrying long encoded strings are withheld (`tools/review/check-summary.mjs`).
  Revisit if the repo goes public.
- Merges made by `github-actions[bot]` do not trigger workflows on `main`; the
  PR already passed every required check.
- The reviewer is the same model family as the authors; a reviewer from a
  different vendor comes with Codex support.
