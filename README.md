# Agent OS

A team template for building real software with AI coding agents. Copy it into
any project and you get:

- **A team with clear roles:** product manager (what), engineering manager (how),
  developers (test-first), an independent code reviewer, a principal engineer
  for the big picture and final sign-off, QA, and an advisory UX reviewer. Defined in [.claude/agents/](.claude/agents/).
- **You as the executive stakeholder.** Agents escalate major decisions to
  [docs/decisions/](docs/decisions/), the meeting room, and wait for you. You
  approve specs, adopt lessons, and own the rules.
- **Gates that cannot be talked past:** tests, secret scanning, static analysis,
  dependency audit and flagged test edits, all in free CI with no model involved
  ([.github/workflows/gates.yml](.github/workflows/gates.yml)).
- **Honesty built into the process:** only CI says tests passed, every agent may
  stop with `BLOCKED`, and every PR carries an evidence receipt
  ([.github/pull_request_template.md](.github/pull_request_template.md)).
- **A lessons ledger:** what the team learned, each lesson linked to the
  evidence, shared across projects ([docs/lessons/](docs/lessons/)).

It is plain files, so it works the same in Claude Code on Windows, macOS and
cloud sessions, and the rules in [AGENTS.md](AGENTS.md) reach other agents too.

## How it fits together

The model is the engine, Claude Code is the harness, and this template is the
operating system around them:

| Part | Like an OS's | Where |
| --- | --- | --- |
| Charter | kernel rules | [CLAUDE.md](CLAUDE.md) |
| Roles | processes, each with its own permissions | `.claude/agents/` |
| Skills | programs | `.claude/skills/` (`/retro`, `/escalate`) |
| Gates | access control | `.github/workflows/gates.yml` |
| Decisions | the system's audit log | `docs/decisions/` |
| Lessons | long-term memory | `docs/lessons/` |

## The loop

1. **Idea → spec.** Ask the `product-manager` agent. It writes
   `docs/specs/...` as a draft. You approve it.
2. **Spec → plan.** The `engineering-manager` agent splits it into tasks, each
   owning its own files.
3. **Plan → code.** A `developer` agent per task, test-first. At most 2–3 at once.
4. **Code → evidence.** CI runs the gates. The `reviewer` agent reviews the
   diff in a fresh context. `qa` adds smoke and regression tests.
   `ux-reviewer` comments on UI changes.
5. **Sign-off.** The `principal-engineer` agent judges the whole: should this
   exist, could we reuse something, does it fit, is the evidence real.
6. **Merge.** Green gates plus the principal engineer's approval; changes to the
   rules wait for you ([merge authority](docs/decisions/2026-10-11-merge-authority.md)).
   Then `/retro` records what the team learned.

## Adopting it in a project

1. Copy everything except `docs/lessons/L-*.md` (those are our lessons; keep
   them if they apply to you).
2. Replace the `tests` job's install and test commands with your project's.
3. Optional: install [Dope TDD](https://github.com/andres-fu/dope-tdd) on your
   machine to enforce test-first inside each session, and enable its catch
   check in CI.
4. Turn on branch protection for `main`: require the `gates` checks and one
   human approval.

## Budget

Designed for a single Claude Max plan: Sonnet by default, Opus only for specs,
plans and reviews, and every gate in free CI. See the cost section of
[CLAUDE.md](CLAUDE.md). A plan is for your own work: if you offer this to
others as a product, each person uses their own Claude login or API key.

## Status

Version 0.1, not yet used on a real project. The lessons tool has tests
(`npm test`). The CI workflow has not run on GitHub yet; expect to fix small
things on its first run. Candidate tools to try are in
[docs/toolbox.md](docs/toolbox.md).

## License

MIT
