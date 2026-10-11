---
title: Who may merge a pull request, and how is it enforced?
status: awaiting-decision
raised_by: stakeholder
date: 2026-10-11
decided_by:
decided_on:
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
| A. Stakeholder merges everything | Only the stakeholder merges | Stakeholder time on every PR | Yes |
| B. Agents merge routine PRs when the gates are green and the principal engineer approves; rules changes are left to the stakeholder by agent discipline | The agents' instructions only | One Opus review per PR | Yes |
| C. As B, but agents work under a separate bot GitHub account; CODEOWNERS marks the rules files, and a ruleset requires code-owner review on them | GitHub itself: a bot cannot approve its own PR, and only the stakeholder owns the rules files | One-time setup of a bot account; GitHub allows one free machine account per person | Yes |

## Recommendation
**A now, C next.** Keep merging yourself while the team is new: it costs about
30 seconds a PR and is the only option enforced today. Move to C when the bot
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
Filled in by the stakeholder.
