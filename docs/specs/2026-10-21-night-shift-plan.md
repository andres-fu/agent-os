---
title: Plan for Night shift - an unattended loop that fixes one ready issue a night, test-first
spec: docs/specs/2026-10-21-night-shift.md
status: draft        # draft | approved. Goes to principal-engineer and security-compliance first.
classification: non-trivial
owner: engineering-manager
date: 2026-10-26
---

## Classification and review
**Non-trivial:** 9 tasks in 3 PRs, with new interfaces. `principal-engineer`
reviews the plan before coding.

Security review: yes. The night shift reads untrusted input (public issues),
holds a GitHub token and runs unattended. `security-compliance` reviews the
plan before coding.

The first review **blocked** on two points: the cap failing open past `gh`'s
default 30 PRs, and the brief reading strangers' text while holding the
token. Both are fixed below, along with its six pieces of advice. The
re-review gave **Pass with advice**, with both blocks resolved; its four
further points are folded in too.

Every PR touches `tools/` or `package.json`, which are protected, so the
stakeholder merges each one.

Read (*observed*): the approved spec, `CLAUDE.md`, the lessons index (L-0001,
L-0002, L-0010, L-0015, L-0019), both decisions on merging and the public
repository, `docs/landscape.md`, `tools/review/protected-paths.mjs`,
`tools/github-app/token.mjs` and its README, `.github/workflows/principal-review.yml`,
`package.json`, `dope-tdd.json`. Also dope-tdd's version-1 night shift
(`tools/night-shift/` at 57a898f in andres-fu/dope-tdd).

## Approach
**Reuse dope-tdd's version 1, and move every deterministic decision into
tested scripts.** dope-tdd's night shift is three Markdown files the scheduled
tasks read from `origin/main`, with no code. Its steps and wording carry over.
What the spec adds (the identity rule, the cap, the label actor, collaborator
filtering, edit-after-label, the diff check, log retention) are yes/no
decisions on GitHub data. A model should not make those from prose, so they
become small Node scripts with unit tests:
- **The picker** decides whether tonight runs and which issue it takes.
- **The diff check** decides whether a branch may be pushed.
- **The log writer** decides what a log entry may contain.

The model does what needs judgement: reading the issue, writing the test and
the fix, writing the brief.

Style follows `tools/onboard/` and `tools/lessons/`: Node 20+ ES modules,
`node:` built-ins only, a pure core with a thin CLI, and fakes injected in
tests. No new dependencies.

Rejected: **instructions only, as in dope-tdd v1**, because the spec's limits
would then be instructions, and L-0010 asks for enforcers where a script can
be one.

Rejected: **one script that runs the whole night**, because writing the test
and the fix needs the model. A script driving the model is the Agent SDK
route, which needs an API key (`docs/landscape.md`).

Rejected: **a separate sandbox repository for the dry run**, because the App
is installed on this repository only (Hard limits), and installing it on a
second one widens what the token can reach. The dry run uses a throwaway
issue on agent-os itself.

## Interfaces and contracts

### `tools/night-shift/pick.mjs`
```
node tools/night-shift/pick.mjs tonight --repo OWNER/NAME --stakeholder LOGIN --app-login LOGIN --workflow FILE [--now ISO]
node tools/night-shift/pick.mjs facts   --repo OWNER/NAME --stakeholder LOGIN --app-login LOGIN --workflow FILE   # read-only, for the brief
```
`--repo` and the logins must match `^[A-Za-z0-9][\w.-]*(/[A-Za-z0-9][\w.-]*)?$`,
and must not contain `..`. Otherwise the result is a usage error (exit 2).
It prints one JSON line on stdout and exits 0. Exit 2 means a usage error.
```js
export function decide(facts, { now, stakeholder, appLogin }) // pure -> Decision
export function isNightPr(pr, { appLogin })  // !isCrossRepository && headRepository != null
                                             // && headRefName.startsWith('night/') && author.login === appLogin
export async function gather(gh, { repo, workflow }) // all GitHub reads, through the injected gh
// Decision = { action: 'stop', reason }                       // fail closed: identity, PR state, CI state
//          | { action: 'main-red', notify: '<repo>: main CI is red <runUrl>' }
//          | { action: 'paused', waiting: n }                // cap: n >= 3 night PRs
//          | { action: 'done-tonight' }                      // a night PR created today (local date)
//          | { action: 'nothing-ready', skipped: [{ number, reason }] }
//          | { action: 'work', issue: { number, title, body, comments: [{ author, body }] },
//              branch: 'night/<n>-<slug>', skipped: [...] }
```
- **Order is fixed:** identity, then main CI, then the cap, then today's PR,
  then the issue.
- **Identity:** `GH_TOKEN` must start with `ghs_`, and
  `gh api /installation/repositories` must list exactly `--repo`. Otherwise
  the result is `stop` with reason `not running as the App for this repository`.
- **Main CI:** the latest completed run of `--workflow` with
  `--branch main --event push`. A fork's PR from a branch it named `main` must
  not count (L-0019). The run URL is built from the run's numeric id, never
  copied from run text.
- **Night PRs:** read with
  `gh pr list --state open --limit 1000 --json number,author,headRefName,headRepository,isCrossRepository,createdAt,isDraft,body`.
  `gh` returns 30 by default (*inferred*), and then 31 fork PRs from strangers
  could push the night PRs out of the list. So if the list holds exactly 1000
  PRs, the result is `stop`, never a short count. `--app-login` is
  `app/agent-os-team`, the form `gh` returns (*observed* 2026-10-26, spec
  "What counts as a night PR"). If the list call fails, or any PR has a null
  `headRepository`, the result is `stop`.
- **Every list is read in full:** issues, `labeled` events and comments are
  paginated (`gh api --paginate`). A list that hits a page limit, or a call
  that fails, gives `stop`, or a skip for that one issue.
- **Issue filters:**
  - The `ready` label's latest `labeled` event must have `actor.login == --stakeholder`.
  - The issue's `author_association` must be `OWNER`, `MEMBER` or `COLLABORATOR`.
  - The body's GraphQL `lastEditedAt` must be null or earlier than that label
    event. If it can't be read, the issue is skipped (fail closed).
  - Comments pass through only from those same associations.
- **"An open PR already fixes it"** counts only PRs that are not cross-repository.
  This applies L-0019: a stranger's fork PR saying `Fixes #3` must not block #3.
- **Skip reasons are fixed strings,** never issue text: `needs-human`,
  `label not added by the stakeholder`, `author not a collaborator`,
  `edited after it was marked ready`, `edit time unreadable`,
  `an open PR fixes it`.
- **The branch slug** is the title lowercased, cut down to `[a-z0-9-]`, at
  most 40 characters.
- **`facts` is what the brief may see, and nothing more:**
  - counts, numbers, URLs built from ids, and the fixed reasons;
  - a title only when the issue's or PR's author is a collaborator, or the
    PR is a night PR; any other title reads `(title withheld: outside author)`.
    Titles are cut to 120 characters, and token-shaped text is redacted, as
    in the log;
  - no bodies or comments at all.

  It returns night PRs and their CI state, `needs-human` issues, main CI, the
  `ready` queue and any night PR taken out of draft by someone other than the
  stakeholder.

### `tools/night-shift/github.mjs`
`export function makeGh({ execFile })` returns `{ json(args), graphql(query, vars) }`.
- It runs `gh` with array arguments, never a shell, with a 30-second timeout.
- GraphQL variables are passed with `-f` (a raw string), never `-F`, which
  would read `@file`.
- Any failure throws, and `gather` turns a throw into `stop`.

### `tools/night-shift/diff-check.mjs`
```
git diff --name-only --no-renames -z origin/main...HEAD | node tools/night-shift/diff-check.mjs
```
- It prints `{ ok, forbidden: [paths] }` and exits 1 when anything is
  forbidden.
- `--no-renames` lists both sides of a move, so moving `.github/x` out of
  `.github/` is still caught. `-z` keeps odd file names intact.
- Empty input fails closed (exit 1): an empty diff is never pushed.
- Paths are compared lower-cased, so `.GitHub/` on a case-insensitive
  checkout is still caught.
- `export const FORBIDDEN` holds the spec's list:
  - `CLAUDE.md`, `AGENTS.md`;
  - `.claude/`, `.github/`;
  - `docs/decisions/`, `docs/lessons/`, `docs/specs/`;
  - `tools/night-shift/`, `tools/review/protected-paths.mjs`, `tools/guard/`;
  - `dope-tdd.json`;
  - the scanner settings, `.gitleaks*` and `.semgrep*`;
  - the MCP settings, `.mcp.json` (added 2026-10-26).
- Dependency files are forbidden by **base name at any depth**: `package.json`,
  `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`,
  and `.npmrc` (added 2026-10-26).
It reuses `normalise` and `matches`, which `tools/review/protected-paths.mjs`
starts exporting. It does not reuse `PROTECTED`, which covers all of `tools/`
and would block almost every fix in agent-os. Merge authority still comes
from `PROTECTED`.

### `tools/night-shift/log.mjs`
```
node tools/night-shift/log.mjs append --entry-file PATH    # entry JSON, schema below
node tools/night-shift/log.mjs brief  --text-file PATH     # appends "## Morning brief"
node tools/night-shift/log.mjs prune                       # deletes YYYY-MM-DD.md older than 30 days
```
- Logs go in `~/.agent-os/night-shift/<YYYY-MM-DD>.md` (`AGENT_OS_HOME`
  overrides the folder, as in `token.mjs`), outside every repository.
- An entry has exactly these fields:
  - `time`: ISO;
  - `outcome`: `pr`, `blocked`, `nothing-ready`, `paused`, `done-tonight`,
    `main-red` or `stop`;
  - `issue` and `title`: the title cut to one line of at most 120 characters;
  - `prUrl`: must match `^https://github\.com/[\w.-]+/[\w.-]+/pull/\d+$`;
  - `handoff`: a URL of the same form;
  - `checks`: `{ tests, pass, fail }`, numbers only;
  - `reason`: one of the picker's fixed strings.
- Unknown fields are refused, so an issue body or a token can't get in.
- `brief` text is free text, so it is limited to 4 KiB. Anything shaped like a
  GitHub token (`ghs_`, `ghp_`, `gho_`, `ghu_`, `ghr_`, `github_pat_`) is
  replaced with `[redacted]` before it is written.

### `tools/night-shift/night-shift.md`, `morning-brief.md`, `README.md`
These are the instructions, adapted from dope-tdd v1. The scheduled task's
prompt is only "fetch, then read `tools/night-shift/night-shift.md` with
`git show origin/main:...` and follow it".
- The night shift calls the picker and the diff check, and only acts on their
  JSON.
- It sends the push notification with the picker's `notify` text, unchanged.
- It writes the log only through `log.mjs`.
- **The brief runs no `gh` itself.** It reads the day's log and the output of
  `pick.mjs facts`, and writes only through `log.mjs brief`. Its scheduled
  task allows only those two commands and reading the log folder. It never
  runs `env` or `printenv`, or reads the `gh` config folder;
  `instructions.test.mjs` pins those lines. The
  untrusted text it can see is then limited to what `facts` lets through:
  collaborators' titles. The charter's exception covers the night shift, not
  the brief.

### Decisions developers must not change
- The night-PR identity rule, and the picker's order.
- Failing closed.
- The fixed skip reasons.
- The log schema.
- The instructions are read from `origin/main`.
- Night PRs are drafts.

### Where it runs (decided by the stakeholder, 2026-10-26)
**A dedicated Windows user on the stakeholder's PC** (#32). On that user:
- the App's key, in `~/.agent-os/`;
- Claude Code, logged in to the stakeholder's plan;
- dope-tdd, which stays **required**, as the spec says;
- a clone of the repository.

Nothing else: no personal `gh` login, and no stored git credentials. That is
what meets AC-22, "the session holds none of the stakeholder's own GitHub or
git credentials".

The rejected alternative was the stakeholder's own Windows user. The App
identity would be checked there, but the stored `gh` and git logins would
stay reachable by an agent that unsets `GH_TOKEN`.

**Two ways to schedule it on that user. The dry run (T3.2) picks one:**
1. **The desktop app's scheduled tasks**, with the night-shift user left
   signed in alongside the stakeholder's. Windows keeps both sessions' apps
   running (*inferred*).
   - The docs say these tasks run only "while the desktop app is running and
     your computer is awake" (desktop-scheduled-tasks, read 2026-10-26).
   - So "Keep computer awake" must be on.
2. **`claude -p` from Windows Task Scheduler**, as that user.
   - The docs say non-bare `-p` runs the project's hooks and loads installed
     plugins (headless, read 2026-10-26).
   - It needs a token from `claude setup-token`. *Unknown:* whether the Max
     plan's terms allow scheduled unattended use. Check that before choosing
     this way.

**Not in version 1: cloud scheduled tasks or cloud sessions.** Each reason is
from the docs, read 2026-10-26:
- runs act as the stakeholder's GitHub user, not the App ("Commits and pull
  requests carry your GitHub user", routines);
- repo-declared plugins don't load, so dope-tdd can't guard the run
  (cloud-environments, "What carries over");
- the GitHub proxy rejects GraphQL, so `gh pr` and `gh issue` fail with 403
  (cloud-environments);
- there's no safe place for the App's key: environment variables are visible
  to anyone using the environment.

Revisit when cloud runs can use an App identity and `gh pr`, and dope-tdd's CI
catch check is on in agent-os.

## Tasks
Waves run in order. Tasks in a wave run in parallel and share no file. Each
starts with a failing test, seen red.

### PR 1: "night-shift: picker, diff check and log, tested"
This touches `tools/` and `package.json`, so the stakeholder merges PR 1.
Security review: yes.

| Task | Wave | Files it may change | ACs | First failing test |
| --- | --- | --- | --- | --- |
| T1.1 Picker core | A | `tools/night-shift/pick.mjs`, `tools/night-shift/pick.test.mjs` | AC-1 to AC-13, AC-15 to AC-17, AC-24 | `decide`: three night PRs plus three fork PRs on `night/a..c` from strangers gives `paused` with `waiting: 3`, and a fork's `Fixes #3` does not skip #3 |
| T1.2 Diff check | A | `tools/night-shift/diff-check.mjs`, `tools/night-shift/diff-check.test.mjs`, `tools/review/protected-paths.mjs`, `tools/review/protected-paths.test.mjs` | AC-23 | `tools/night-shift/pick.mjs` and `package.json` are forbidden; `tools/onboard/intake.mjs` is not |
| T1.3 Log writer | A | `tools/night-shift/log.mjs`, `tools/night-shift/log.test.mjs` | AC-29, AC-30, AC-31 | an entry with a `body` field holding `ghs_FAKE` is refused, and the day's file does not contain it |
| T1.4 GitHub reads and CLI | B | `tools/night-shift/github.mjs`, `tools/night-shift/github.test.mjs`, `tools/night-shift/pick.mjs`, `tools/night-shift/pick.test.mjs`, `package.json` | AC-6, AC-9, AC-13 (wiring), AC-22 (identity) | `gather` with a fake `gh` whose `pr list` throws returns `stop`; a `GH_TOKEN` of `gho_x` gives `stop` with `not running as the App for this repository` |

Notes:
- T1.2 changes `protected-paths.mjs` only to add `export` to `normalise` and
  `matches`. Its test file gains one case. No existing assertion changes.
- T1.4 adds PR 1's four test files to `package.json`'s `test` script.
- T1.4 also tests:
  - a PR list of exactly 1000 gives `stop`;
  - a fork run on a branch named `main` is ignored;
  - `facts` withholds a stranger's title and never includes a body;
  - a `--repo` of `a/b;rm` is a usage error.
- T1.2 also tests a move out of `.github/` (both sides listed), a nested
  `sub/package.json`, and empty input failing closed.
- T1.3 also tests that `brief` redacts `ghs_…` and cuts text at 4 KiB.

### PR 2: "night-shift: instructions, brief and README"
This touches `tools/`, so the stakeholder merges it. Security review: yes.

| Task | Wave | Files it may change | ACs | First failing test |
| --- | --- | --- | --- | --- |
| T2.1 Instructions | A | `tools/night-shift/night-shift.md`, `tools/night-shift/morning-brief.md`, `tools/night-shift/README.md`, `tools/night-shift/instructions.test.mjs` | AC-18 to AC-21, AC-25 to AC-27, AC-32 to AC-35 (text) | `instructions.test.mjs`: the README's task prompt reads `git show origin/main:tools/night-shift/night-shift.md`; `night-shift.md` calls `pick.mjs tonight` before any `git` write and names `--draft` |
| T2.2 Draft skip pinned | A | `tools/review/principal-review-workflow.test.mjs` | AC-28 | the review job's `if:` contains `!github.event.pull_request.draft` (it passes today: the receipt shows it fails once that line is removed) |
| T2.3 Docs and test list | B | `README.md`, `package.json` | (docs) | n/a: adds `instructions.test.mjs` to the `test` script, and one README line under the operating layer |

### PR 3: "night-shift: dry run, then turn-on"
| Task | Wave | Files it may change | ACs | First failing test |
| --- | --- | --- | --- | --- |
| T3.1 Night-shift user (stakeholder) | A | `tools/night-shift/README.md` | AC-22 (no stakeholder logins) | n/a: the stakeholder creates the dedicated Windows user and sets it up as in "Where it runs"; `gh auth status` there lists no stored login |
| T3.2 Dry run (QA) | B | `docs/night-shift/dry-run-2026-MM-DD.md` | AC-14, AC-18 to AC-22, AC-25 to AC-27, AC-32 to AC-34 | n/a: a real run (L-0015) as the night-shift user, recorded with command output; it picks the desktop app or `claude -p` |
| T3.3 Turn-on (stakeholder) | C | `tools/night-shift/README.md` | — | n/a: the stakeholder creates the two scheduled tasks on the night-shift user; the README records the date and which way they run |

Notes:
- T2.1's README has a short **"How to run it"** section:
  - **Recommended:** a dedicated OS user, or machine, that holds no personal
    logins, left on with the desktop app's scheduled tasks or `claude -p`.
  - **Not supported yet:** cloud runs, for the four reasons in "Where it runs".
  - **Required:** dope-tdd.
- **T3.2 runs on agent-os itself, as the night-shift user:**
  1. The stakeholder files and labels one throwaway `ready` issue.
  2. A session runs the night-shift instructions by hand, with the App token.
  3. The result must be a draft PR from `night/…`, a log entry and a brief.
  4. A second run the same night must give `done-tonight`.
  5. Calling the ruleset API with the token must be refused (AC-22).
  6. `git status` in the stakeholder's checkout must be unchanged (AC-18).

  The stakeholder closes the draft PR. The evidence file quotes the outputs,
  and holds no token, header or issue body. Before it is committed, `gitleaks
  detect --no-git` runs on it locally. CI's secret scan runs again on the PR.

## AC coverage
ACs are numbered in the spec's order: picking 1–9, cap 10–15, main red 16–17,
doing the work 18–21, limits 22–26, the PR 27–28, log and brief 29–35.

| AC | Task | Test file | AC | Task | Test file |
| --- | --- | --- | --- | --- | --- |
| AC-1 to AC-5 | T1.1 | `pick.test.mjs` | AC-22 | T1.4, T3.2 | `pick.test.mjs`, dry run |
| AC-6 to AC-9 | T1.1, T1.4 | `pick.test.mjs` | AC-23 | T1.2 | `diff-check.test.mjs` |
| AC-10 to AC-13 | T1.1, T1.4 | `pick.test.mjs` | AC-24 | T1.1 | `pick.test.mjs` |
| AC-14 | T3.2 | dry run | AC-25, AC-26 | T2.1, T3.2 | `instructions.test.mjs`, dry run |
| AC-15 to AC-17 | T1.1 | `pick.test.mjs` | AC-27 | T2.1, T3.2 | `instructions.test.mjs`, dry run |
| AC-18 to AC-21 | T2.1, T3.2 | `instructions.test.mjs`, dry run | AC-28 | T2.2 | `principal-review-workflow.test.mjs` |
| AC-29 to AC-31 | T1.3 | `log.test.mjs` | AC-32 to AC-34 | T2.1, T3.2 | `instructions.test.mjs`, dry run |
| | | | AC-35 | T2.1 | `instructions.test.mjs` |

## What enforces each protection (L-0010)
| Protection | Enforced by |
| --- | --- |
| It runs as the App, for this repository only | **Script:** the picker's identity check. **GitHub:** the App's permissions. Keeping the stakeholder's logins out: **the OS**, since it runs as a dedicated Windows user that holds none of them (see "Where it runs"). |
| The cap can't be pushed out of the list by fork PRs | **Script:** the picker reads up to 1000 PRs and stops if it hits that limit. |
| The brief sees no stranger's text | **Script:** `facts` withholds outside authors' titles, and every body and comment. Its task's command allowlist is best-effort (Claude Code settings). |
| Nothing reaches `main` without the stakeholder | **GitHub:** the ruleset. **Workflow:** `principal-review` skips drafts (pinned by T2.2). |
| At most three night PRs waiting; one a night | **Script:** the picker. |
| Only the stakeholder's `ready`, collaborators' text, no edit after labelling | **Script:** the picker. |
| No forbidden path or dependency change is pushed | **Script:** the diff check, run before every push. Best-effort, since it runs in the agent's session; the backstop is the stakeholder's merge. |
| Test-first | **dope-tdd** in enforce mode; the instructions stop the night if the first test edit isn't `unlocked`. |
| The log holds no issue body, comment or token | **Script:** the log writer's schema, and token-shaped text redacted from the brief. |
| Main red sends one fixed notification | **Script:** the picker builds the text; sending it is an instruction. |
| Never merge, approve, close, reopen, force-push or mark ready | **GitHub,** for merging. The rest is an instruction; the dry run's command log checks it once. |
| No network beyond GitHub and the registry; no secrets read | Instruction only (Claude Code settings are best-effort, #37). |
| The instructions can't be changed from a local branch | **The task prompt** reads `origin/main`; `instructions.test.mjs` pins it. |

## Risks
- **The App's login form differs between calls.** `gh` shows
  `app/agent-os-team`; REST shows `agent-os-team[bot]` (*inferred*). The
  picker uses `gh pr list` only, and the dry run (AC-14) confirms it.
  Escalate if the forms differ inside one call path.
- **New test files can't be wired in.** In agent-os the `test` script lists
  each file in `package.json`, which the night shift may not change. So a
  night fix may only add tests to existing test files, and a fix that needs a
  new one blocks. Escalate if most `ready` issues block for this reason.
- **A personal login ends up on the night-shift user.** That would undo the
  separation. The setup steps (T3.1) say never to sign in to GitHub there as
  the stakeholder. The dry run checks that `gh auth status` lists no stored
  login. Re-check it before turn-on.
- **Desktop scheduled tasks and project hooks.** The docs don't say whether a
  desktop scheduled task runs the project's session-start hook and plugins
  exactly as an interactive session does. If the hook doesn't run, the
  picker's identity check fails closed. The dry run is done the same way the
  scheduled task will run. If the hook or dope-tdd doesn't load there, switch
  to `claude -p`, or escalate.
- **Package installs run scripts.** agent-os has no dependencies, so there is
  nothing to install. For other projects the instructions say: install from
  the lockfile with scripts off (`npm ci --ignore-scripts`) where the project
  allows. That is an instruction only.
