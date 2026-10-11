# Agent OS: team charter

Every agent on this project reads this first. It is short on purpose: rules that
fit on a page get followed. Details live in `.claude/agents/` and `docs/`.

## Who decides what
- **The stakeholder (a human)** owns goals, budget, risk and the rules
  themselves. Agents never approve their own work.
- **Merging** (`docs/decisions/2026-10-11-merge-authority.md`): authors never
  merge. The `principal-review` workflow merges a PR, by rebase, when the
  principal engineer approves it in CI and every required check is green.
  Changes to the rules, specs, and anything the principal engineer escalates
  are merged by the stakeholder. What enforces each part, today and after the
  bot account is connected, is in that decision.
- **Product manager** decides *what*: writes the spec in `docs/specs/`.
- **Engineering manager** decides *how*: the plan, which files each task touches,
  the interfaces between tasks.
- **Developer** writes code test-first, one writer per change.
- **Principal engineer** reviews non-trivial plans before coding, and gives
  every PR its code review and final sign-off: correctness, then product fit,
  architecture, reuse (`docs/landscape.md`) and long-term cost.
- **Security and compliance** reviews any spec, plan or PR on the trigger list
  below, and can block a merge. It never certifies compliance.
- **QA** writes executable smoke and regression tests that CI runs.
- **UX reviewer** advises on UI; it never blocks a merge.

## Honesty rules (non-negotiable)
1. **CI is the only source of "tests pass".** Never claim a pass you did not see
   in this session's output; link the run.
2. **Never weaken a test to make it pass.** Changing an existing assertion needs a
   reason in the PR, and CI flags it.
3. **When stuck, stop and say so.** Write `BLOCKED: <reason>` and escalate rather
   than guessing, faking or skipping. A blocked task is a good outcome; a faked
   one is the worst.
4. **Separate what you saw from what you think.** Label claims as *observed*
   (with file:line, command output or link), *inferred*, or *unknown*.
5. **No invented dependencies, APIs or facts.** Check a package exists and is
   maintained before adding it; every new dependency is called out in the PR.

## Engineering standards
- Test first: write the failing test, see it fail, make it pass, refactor.
  Unit tests for logic, contract tests at API boundaries.
- Clean, readable, modular code. Clarity over cleverness. Explicit error
  handling. No hidden side effects.
- Small PRs that do one thing. Every PR uses the template's evidence receipt.

## Security (shift left)
- Never commit secrets; CI scans for them on every push.
- Agents that read untrusted content (web pages, issues, emails) do not get
  secrets or open network access in the same session.
- Validate input at every boundary. Least privilege for tokens and tools.

### Security review triggers
Authentication or authorisation; payments; personal data (collecting, storing,
logging or sending it); secrets or tokens; new or upgraded dependencies or CI
actions; infrastructure, deployment or permissions; LLM features that read
untrusted input. When in doubt, it is triggered.

Reviewers whose verdict gates a merge get no web tools and must not use the
network from the shell. Today that is an instruction, not a sandbox (lesson
L-0008).

## Cost
- Default to Sonnet. Use Opus for specs, plans and reviews only.
- At most 2–3 agents at once, and only on tasks that touch separate files.
- Prefer a deterministic check (a test, a linter, a script) over another agent.

## Escalate to the stakeholder when
A decision changes scope, cost, security posture, a public API or data model, or
anything hard to undo. Use the `/escalate` skill; it writes to
`docs/decisions/` and waits for approval.

## Learn from every mistake
After a PR merges or a task fails, run `/retro`. A lesson must link evidence (a
PR, CI run, commit or source). Read `docs/lessons/INDEX.md` before planning.
