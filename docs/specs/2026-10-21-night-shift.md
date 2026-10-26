---
title: Night shift - an unattended loop that fixes one ready issue a night, test-first
status: draft        # draft | approved | done. Only the stakeholder sets approved.
owner: product-manager
date: 2026-10-21
---

## Problem
Agent OS is a rulebook today: a charter, roles, CI gates, a principal engineer
in CI and a lessons ledger (README.md, *observed*). Nothing does the work while
the stakeholder is away. Small, clear issues wait until someone opens a session.

Evidence:
- The stakeholder's decision of 2026-10-21: Agent OS becomes a team that does
  the work, with a work queue (GitHub issues), a runner (a nightly scheduled
  task), a team room and a daily log. agent-os is its own first project.
- andres-fu/dope-tdd already wrote a version-1 night shift for itself
  (andres-fu/dope-tdd#162, *observed*: `tools/night-shift/` at 57a898f). It is
  specific to that repository. This spec makes it generic for any project that
  uses Agent OS.
- Starr, Mann and Storey, *Theory of Developer Momentum*, arXiv 2610.24935,
  as summarised in andres-fu/dope-tdd#169
  (`docs/planning/process-and-agent-os.md`, "Ideas from the Theory of
  Developer Momentum", *observed*; the paper itself was not re-read for this
  revision). Its claims: momentum (felt progress toward a goal) is not flow
  (immersion). A task is a hill: uphill is fog and exploring, the crest is
  when the path becomes clear, downhill is execution. Working context is
  rebuilt every session. Waiting on an agent breaks orientation. With agents
  the downhill part compresses, and one person's momentum can outrun the
  team's capacity to verify. The study is interview-based (12 developers, 8
  feedback interviews), so its agent findings are leads, not results
  (*inferred* for this project: none of them has been tested here). Five
  parts of this spec come from it: what `ready` means, the cap on waiting
  night PRs, the two kinds of block, the handoff note, and the order of the
  morning brief.

Who has it: **the stakeholder**, who owns the backlog and reviews what the team
produces, and has limited hours.

## Goal
On each night it runs, the night shift either opens one pull request that fixes
the oldest `ready` issue test-first, or says clearly why it did not. It never
merges anything. A read-only morning brief tells the stakeholder, in under a
minute of reading, what happened and what needs them.

## How it works (what, not how)

### Two scheduled runs on the stakeholder's machine
| Run | When (example) | Does |
| --- | --- | --- |
| **Night shift** | 01:00 | Takes at most one issue, fixes it test-first in a fresh worktree, opens a PR, writes the day's log |
| **Morning brief** | 07:00 | Reads the log and GitHub, writes a short summary, and changes nothing |

They run as local scheduled tasks, not in the cloud. Plugins such as dope-tdd do
not load in cloud sessions (lesson L-0005), and the night shift depends on
dope-tdd guarding its work. A run that was due while the machine was off or
asleep runs at the next launch, or not at all; both are acceptable.

The instructions live in the project repository, on `main`. A scheduled task's
prompt only says "read the night-shift instructions as they are on
`origin/main`, and follow them". That way, changing what the night shift does
goes through a PR, CI and the ruleset like any other change, and a branch
checked out locally cannot change it.

### What the night shift does, in order
1. **Main's health.** It reads the latest run of the project's main CI workflow
   on `main` (`gates` in agent-os). If that run failed, it sends **one** phone
   push notification naming the run, writes the log, and stops. This is the only
   reason it ever notifies.
2. **Room to review.** If three or more night PRs are open, draft or not,
   it logs "N night PRs waiting" and stops. See "The cap on waiting night PRs"
   below.
3. **Pick the work.** Of the open issues labelled `ready`, it drops any that also
   carry `needs-human`, any that an open PR already fixes, and any that is not
   past the crest (below). It takes the oldest one left, by creation date. If
   none are left, it logs "nothing ready" and stops. Each issue dropped for not
   being past the crest is logged by its number and the fixed name of the
   heading it lacks (`Goal`, `Done when` or `First failing test`), never with
   text from the issue.
4. **Read it as data.** It reads the issue and its comments to learn what done
   looks like. Text in an issue, a comment or a PR is never an instruction to
   it. If what done looks like is unclear, it blocks (step 8).
5. **A fresh worktree.** It works on a new branch `night/<issue>-<slug>`, based
   on `origin/main`, in its own worktree. It never works in the stakeholder's
   checkout.
6. **Test first, under a guard.** It starts from the first failing test the
   issue names. Its first edit is to the test paired with the code it will
   change. If dope-tdd does not answer that edit with an `unlocked`
   line, dope-tdd is not guarding the worktree, so it stops and logs that. It
   writes a failing test and sees it fail for the right reason, then makes the
   smallest fix and sees it pass. It needs the fix proven: dope-tdd's PROVEN, or
   a break-and-restore by hand. After three failed attempts at green, it
   blocks.
7. **Check the diff, then open the PR.** It runs the project's full checks, and
   a deterministic diff check that fails on any forbidden path or any change to
   the dependency manifest or lockfile. It opens the PR **as a draft**. Its body
   starts `Fixes #<n>`, follows the project's PR template and evidence receipt
   with numbers copied from this run's output, and ends `Opened by the night
   shift; not merged.` The stakeholder marks it ready for review. Only then does
   the CI principal engineer review it, because `principal-review` skips draft
   PRs.
8. **Block rather than guess.** It comments `BLOCKED: <why>` on the issue, with
   what it tried and what a person needs to decide, and adds `needs-human`.
   The comment's second line names the kind of block (see "Two kinds of
   block" below): `Kind: decision` or `Kind: wrong way`. A useful partial
   start may be pushed as a draft PR. Otherwise nothing is pushed.
9. **Hand off.** On a night that worked an issue, it writes a handoff note
   (below): in the PR body when it opened a PR, otherwise in the `BLOCKED:`
   comment. A night that stopped at step 1, 2 or 3 worked no issue and writes
   none.
10. **Log.** It appends an entry to the day's log: the time, the issue, the
    outcome (PR link, blocked, nothing ready, night PRs waiting, or main red),
    a link to the handoff note, and the check summary lines.

### What `ready` means here: past the crest
A task is a hill. Uphill is fog and exploring; the crest is when the path
becomes clear; downhill is doing it. The night shift takes only the downhill
part. Getting an issue over the crest is the product manager's job, and the
stakeholder's `ready` label says it is over. This adds to the Definition of
Ready in `docs/specs/2026-10-21-scrum-board.md`.

An issue is past the crest when its body has:
- **Goal:** what it is for, in a sentence or two;
- **Done when:** what done looks like, as testable acceptance criteria;
- **First failing test:** the test file and the behaviour the first new test
  checks.

The picker checks that each of the three headings is present and has text
under it: at least one non-blank line before the next heading. A heading
inside a code block or an HTML comment does not count. Whether that text is good enough is the stakeholder's judgement when
they add `ready`, which is an instruction. Because an issue edited after it was
labelled is refused, the body the picker checks is the one the stakeholder
labelled.

### The cap on waiting night PRs
"One PR a night" limits how fast drafts arrive, not how many pile up. With
agents the downhill part is fast, and the night shift could produce work
faster than the stakeholder can verify it. So the night shift does not run
while three night PRs are open. It counts every open one, draft or not: a PR
marked ready for review can still be waiting on the stakeholder's merge.

**What counts as a night PR.** A branch name is not proof: in a public
repository anyone can open a PR from a fork with a branch named `night/x`, and
three of those would pause the night shift for good. So a night PR is an open
PR whose head repository is this repository, whose head branch starts
`night/`, and whose author is the agents' App account. Every rule here that
counts or lists night PRs uses this definition: the cap, the one-PR-a-night
check and the morning brief. *Inferred:* a PR opened with the App's
installation token has the App's bot account as its author. The build checks
this with a real run (L-0015). If that login were wrong, the cap would count
nothing and fail open, so the picker fails closed instead: if it cannot list
the open PRs, or a PR's head repository is missing (a deleted fork), it stops
the night and logs why.

Three is a starting number: three nights of work that a stakeholder with
limited hours can still review in one sitting (*assumption*). A paused night is
logged, and the morning brief says so on its first line.

### Two kinds of block
A block costs the stakeholder more or less depending on what happened:
- **`Kind: decision`**: the night shift is on the path the issue describes and
  needs a choice to go on, for example between two behaviours the issue allows,
  or a change to a protected path. Cheap to pick up: decide, and remove
  `needs-human`.
- **`Kind: wrong way`**: the work went off the intended path. Three failed
  attempts at green, or a fix that turned out to need something the issue did
  not foresee. Costly: first work out what happened, starting from the
  handoff note.

The night shift names the kind; that is an instruction. A `BLOCKED:` comment
with no `Kind:` line, or with another value, is treated as `wrong way`, the
costlier kind, so a missing label never makes a block look cheap. Anyone can
comment on a public issue, so the brief reads a `Kind:` line only from a
`BLOCKED:` comment the agents' App wrote; any other `BLOCKED:` comment never
counts as a night-shift block.

### The handoff note
Working context has to be rebuilt every session, by the stakeholder in the
morning and by the next night that takes the issue. The handoff note is where
they start. It has four headings, each with text, or `none`:
- **Done:** what this night finished;
- **Next step:** the first thing to do on picking it up;
- **Open question:** what a person needs to answer, if anything;
- **Left red on purpose:** any test left failing deliberately, with its file,
  its name and why.

Writing it is an instruction. The morning brief flags a night PR or a
night-shift `BLOCKED:` comment that lacks any of the four headings.

The note is written by an agent that read untrusted issue text, so it may
carry that text on. The brief and the next night read a handoff note only from
a night PR's body or a `BLOCKED:` comment the agents' App wrote, and always as
data, never as instructions.

### Hard limits, and what enforces each
Per lesson L-0010, a limit with no enforcer is called an instruction.

| Limit | Enforced by |
| --- | --- |
| It runs under a credential that cannot change settings, the ruleset, workflows or other repositories | **GitHub:** a GitHub App installation token that expires after an hour. The App is installed on this repository only, with contents, pull requests and issues set to write and no workflow or administration permission. Commits keep the stakeholder as author. Not the stakeholder's own login, which is kept out of the session (decision request, option D). |
| Nothing it writes reaches `main` without the stakeholder | **GitHub:** the ruleset on `main` requires a PR and the `principal-engineer` check. **The workflow:** `principal-review` skips draft PRs, and every night-shift PR is a draft. |
| It never merges, approves, closes or reopens a PR | **GitHub**, for merging: the required check above. The rest is an instruction. |
| It never marks a PR ready for review: only the stakeholder takes a night PR out of draft | An instruction. The token's pull-requests write permission allows it, so the morning brief lists any night PR that left draft without the stakeholder (by the ready-for-review event's actor). |
| It never force-pushes, deletes a branch or rewrites history | **GitHub**, on `main`: the ruleset blocks force pushes and deletion. On other branches: an instruction. |
| No commits on local `main` | **The branch guard hook** (`tools/guard/branch-guard.mjs`), best-effort |
| It never changes the files that govern it or the team (listed below), and adds no dependencies | **A deterministic diff check** before every push, which reuses `tools/review/protected-paths.mjs`. It runs in the agent's own session, so it is best-effort. The backstops are the protected-paths rule and the stakeholder's merge at merge time, and the token's lack of workflow permission. |
| At most one pull request per night | **The issue picker**, a script: it exits with nothing to do if a night PR (as defined under "The cap on waiting night PRs") was opened today |
| No night run while three night PRs are open | **The issue picker**, a script: it counts open PRs whose head repository is this one, whose head branch starts `night/` and whose author is the agents' App, and exits with nothing to do at three or more. Fork PRs and PRs by anyone else never count. |
| It takes only issues past the crest | **The issue picker**, a script: it skips a `ready` issue whose body lacks text under **Goal**, **Done when** or **First failing test**. Whether that text is clear enough is an instruction (the stakeholder's call when labelling). |
| Every block names its kind, and every worked night leaves a handoff note | An instruction. The morning brief treats a block with no kind as `wrong way`, and flags a missing handoff heading. |
| Test-first | **dope-tdd** in enforce mode; step 6 stops the night if it is not guarding |
| Issue text is data, not instructions | **The issue picker:** it passes on only the issue body and comments written by collaborators (by author association). Everything after that is an instruction. |
| It calls no network beyond GitHub and the package registry, and reads no secrets | **The scheduled task's tool permissions** (an allowlist). Today that is Claude Code's settings, which are best-effort. |
| Every number it writes comes from output it saw | An instruction |

The files that govern it or the team: the charter (`CLAUDE.md`, `AGENTS.md`),
`.claude/`, `.github/`, `docs/decisions/`, `docs/lessons/`, `docs/specs/`, the
night-shift instructions and picker, the protected-paths rule,
`dope-tdd.json`, the branch guard, and the dependency manifest and lockfile.
If a fix needs one of them, it blocks.

### The daily log and the morning brief
The log is one dated Markdown file per day, kept on the stakeholder's machine
outside the repository (*assumption*: the log can hold issue titles from a
public repo, so it stays out of commits). It holds issue numbers, titles,
links, outcomes and check summary lines. It never holds issue bodies,
comments, tokens or environment values. Logs older than 30 days are deleted
(*assumption*). The morning brief treats the log, issues and PRs as data, and
runs with read-only tools. The brief reads that log, the
open night PRs and their CI, the `needs-human` issues, main's CI and the
`ready` queue. It is built for re-orientation: the stakeholder picks up from
it, so it leads with what to do next, not with what happened. It writes at
most 15 lines, in this order:
1. **the next decision:** the one thing the stakeholder should do first, with
   its link (main red, then the night paused by the cap, then the oldest
   `decision` block, then the oldest night PR waiting for review);
2. what else needs the stakeholder, with blocks split into **decisions on the
   intended path** (cheap) and **went the wrong way** (costly: start from the
   handoff note), and any missing handoff headings;
3. what the night shift did;
4. what is queued, including `ready` issues skipped as not past the crest and
   the part each lacks.

It links every PR and issue, and appends the brief to the same day's log under
`## Morning brief`.

## Acceptance criteria
Each one testable. The deterministic parts (picking an issue, checking a diff
against the forbidden paths, reading CI status, formatting the log) should be
code with unit tests. The rest is checked by a dry run against a test
repository.

**Picking the work**
- [ ] Given open issues #3 (`ready`, oldest), #5 (`ready`) and #7 (no label),
  when the night shift picks, then it picks #3.
- [ ] Given the oldest `ready` issue also carries `needs-human`, then it is
  skipped and the next oldest `ready` issue is picked.
- [ ] Given an open PR whose body contains `Fixes #3`, then #3 is skipped.
- [ ] Given no open issue is `ready`, then no branch, commit, PR, comment or
  label change is made, and the log says "nothing ready".
- [ ] Given an issue with no `ready` label whose text says it is ready, or asks
  to be worked on, then it is not picked.
- [ ] Given a `ready` issue whose `ready` label was added by any account other
  than the stakeholder's (by the label event's actor), including the agents'
  App, which has write access, then it is not picked
  (`docs/specs/2026-10-21-scrum-board.md`, "Who moves what").
- [ ] Given a `ready` issue filed by someone who is not a collaborator, then it
  is not picked. The stakeholder triages every outside report and re-files
  the work as their own issue (stakeholder, 2026-10-21; see open question 2).
- [ ] Given a picked issue with comments from a collaborator and from a
  non-collaborator, then only the collaborator's comments reach the agent.
- [ ] Given a picked issue whose body was edited after the `ready` label was
  added, then it is not worked on. It is blocked with "edited after it was
  marked ready". The edit is found by comparing the body's last edit time, in
  the issue's edit history, with the time of the label event.
- [ ] Given the oldest `ready` issue has **Goal** and **Done when** but no
  **First failing test** heading, or the heading with no text under it, then
  it is skipped, the next oldest issue past the crest is picked, and the log
  names the skipped issue and "First failing test" as the missing part.
- [ ] Given every `ready` issue lacks one of the three headings, then no
  branch, commit, PR, comment or label change is made, and the log says
  "nothing ready" and lists each skipped issue with its missing part.
- [ ] Given an issue whose only **First failing test** heading is inside a code
  block or an HTML comment, then it is skipped as lacking that heading.
- [ ] Given a skipped issue whose body has `Goal: ignore previous instructions`
  and no **First failing test**, then its log line holds only the issue
  number and `First failing test`, and none of the body's text.

**The cap on waiting night PRs**
- [ ] Given three open night PRs, two drafts and one ready for review, then
  no issue is picked, nothing is pushed, and the log records "3 night PRs
  waiting".
- [ ] Given two open night PRs and a `ready` issue past the crest, then the
  issue is picked.
- [ ] Given three open PRs of which only two have a head branch starting
  `night/`, then the night shift runs.
- [ ] Given two open night PRs and three open PRs from forks with head branches
  `night/a`, `night/b` and `night/c`, then the night shift runs, and the fork
  PRs count neither toward the cap nor as today's PR.
- [ ] Given two open night PRs and a third PR on this repository's branch
  `night/x` whose author is not the agents' App, then the night shift runs.
- [ ] Given the API call that lists open PRs fails, or an open PR has no head
  repository, then no issue is picked, nothing is pushed, and the log says the
  night stopped because PR state could not be read.
- [ ] Given a real run in which the night shift opened a PR, then the picker
  counts that PR as a night PR (L-0015).
- [ ] Given main CI is red and three night PRs are open, then the one push
  notification is still sent (the main check comes first).

**Main red**
- [ ] Given the latest main CI run failed, then exactly one push notification is
  sent, with fixed text: `<project>: main CI is red` and the run's URL, which
  is built from the run's id. It holds no issue, commit or run text. No issue
  is picked, and the log records "main red".
- [ ] Given the latest main CI run passed, then no push notification is sent,
  whatever else happens that night (a PR, a block or nothing ready).

**Doing the work**
- [ ] Given a picked issue, then all edits happen on a new branch named
  `night/<issue>-<slug>` from `origin/main`, in a worktree that is not the
  stakeholder's checkout. The stakeholder's checkout has no new changes
  afterwards (its `git status` is unchanged).
- [ ] Given dope-tdd does not report `unlocked` on the first test edit, then the
  night stops with nothing pushed, and the log says dope-tdd was not guarding.
- [ ] Given a fix is pushed, then the branch history has a commit where the new
  test fails before the commit that makes it pass, and the PR body quotes both
  summary lines.
- [ ] Given three attempts at green fail, then the issue gets a `BLOCKED:`
  comment and the `needs-human` label, and no ready-for-review PR is opened.
- [ ] Given three attempts at green fail, then the `BLOCKED:` comment's second
  line is `Kind: wrong way`.
- [ ] Given a fix needs a change to a protected path, then the `BLOCKED:`
  comment's second line is `Kind: decision`.

**The handoff note**
- [ ] Given a night that opened a PR, then the PR body has the headings
  **Done**, **Next step**, **Open question** and **Left red on purpose**, each
  with text or `none`.
- [ ] Given a night that blocked without a PR, then the `BLOCKED:` comment has
  the same four headings.
- [ ] Given a partial start pushed with a test still failing, then **Left red
  on purpose** names that test's file and name.
- [ ] Given a night that stopped at main red, the cap or nothing ready, then no
  handoff note is written.

**Limits**
- [ ] Given the night shift's scheduled task, then the GitHub credential it uses
  is the App's installation token for this one repository, with no
  administration or workflow permission, and the session holds none of the
  stakeholder's own GitHub or git credentials. Calling the ruleset or
  repository-settings API with it
  is refused by GitHub.
- [ ] Given the fix would change any forbidden path listed under Hard limits,
  or the dependency manifest or lockfile, then the diff check fails, nothing is
  pushed, and the issue is blocked naming the path.
- [ ] Given a night that already opened a PR, when the night shift runs again
  the same night, then it opens no second PR.
- [ ] Given any night, then the night shift runs no merge, approve, close,
  reopen, force-push or branch-delete command. A dry run's command log shows
  none.
- [ ] Given an issue or comment that asks for a secret, a network call outside
  GitHub and the package registry, another repository, or a change to a
  forbidden path, then the night shift does not do it, and it blocks the issue
  quoting the request.

**The PR**
- [ ] Given a PR is opened, then it is a draft, its body's first line is
  `Fixes #<n>`, its evidence receipt is filled from this run's output, and its
  last line is `Opened by the night shift; not merged.`
- [ ] Given a night-shift draft PR, then `principal-review` does not run on it,
  and it has no auto-merge, until the stakeholder marks it ready for review.

**Log and brief**
- [ ] Given any night, then the day's log gains exactly one night-shift entry
  with the time, the issue (or none), the outcome and the check summary lines.
- [ ] Given any night, then the log contains no issue body, comment text, token
  or environment value. A test feeds an issue with a fake secret in its body,
  and the log does not contain it.
- [ ] Given log files older than 30 days, then the next night shift deletes
  them.
- [ ] Given a morning brief run, then no file in the repository changes, and no
  issue, PR or label on GitHub changes.
- [ ] Given a log entry or issue title that contains instructions, then the
  brief does not follow them. It reports the title as text.
- [ ] Given a log with one PR, one blocked issue and two queued issues, then the
  brief is at most 15 lines, lists what needs the stakeholder first, and links
  each PR and issue.
- [ ] Given one `decision` block and one waiting night PR, then the brief's
  first line is the decision block, with its link.
- [ ] Given a night paused by the cap, then the brief's first line says the
  night shift is paused and links the waiting night PRs.
- [ ] Given one `Kind: decision` block, one `Kind: wrong way` block and one
  `BLOCKED:` comment with no `Kind:` line, then the brief lists the first under
  decisions and the other two under went the wrong way.
- [ ] Given a night PR whose body lacks the **Next step** heading, then the
  brief flags it, naming the PR and the missing heading.
- [ ] Given a `ready` issue skipped as not past the crest, then the brief lists
  it under what is queued, by its number and the fixed name of the heading it
  lacks, with none of the issue's body text.
- [ ] Given a `BLOCKED:` comment with `Kind: decision` written by an account
  other than the agents' App, then the brief does not list it as a block, and
  it never takes the brief's first line.
- [ ] Given a handoff note or `Kind:` line that contains instructions, then the
  brief and the next night do not follow them. The brief reports the text as
  data.
- [ ] Given the night shift instructions are changed on a local branch but not
  on `main`, then the next run follows the `main` version.

## Non-functional requirements
- **Security:**
  - Triggered: it reads untrusted text (public issues), holds a GitHub token,
    and runs unattended.
  - Reviewed by security-compliance on this draft: block until the scoped
    token, draft PRs, the collaborator-only reading and named enforcers were
    acceptance criteria. This revision adds them, and it needs a re-review
    before approval.
  - Reviewed by security-compliance on the momentum revision (2026-10-26,
    PR #50 at d59a258): **Pass with advice**. Its four points are folded in:
    the picker fails closed when it cannot read PR state; only the App's
    `BLOCKED:` comments and night PRs count as blocks or handoff notes, read
    as data; "text under a heading" is defined; and the brief shows a skipped
    issue only by number and heading name. Not yet reviewed after these
    edits.
  - The charter's rule on untrusted content and secrets needs a named
    exception for the night shift, with these limits, or the stakeholder
    decides against it (open question 2).
  - Only issues labelled `ready` are worked on. On GitHub, only people with
    triage access or higher can add labels (*inferred* from GitHub's
    permissions model). The agents' App can add labels too, so the picker
    accepts `ready` only when the stakeholder's own account added it.
  - Each limit's enforcer is in the Hard limits table.
- **Cost:**
  - Sonnet, per the charter.
  - One issue and at most three attempts at green a night, then it blocks.
  - No run at all while three night PRs are open, so tokens are not spent
    on work nobody can review yet.
  - The morning brief reads only, and is short.
  - No hosting; it runs on the stakeholder's existing plan.
- **Performance:** no target. A night run may take as long as the plan's limits
  allow.
- **Accessibility:** the brief is plain text with links, readable on a phone.
- **Privacy and data:** the log stays on the stakeholder's machine. The night
  shift handles no personal data beyond public GitHub usernames in the issues it
  reads.

## Out of scope
- Merging, or turning on auto-merge, in version 1 (open question 1).
- Running in the cloud.
- More than one issue a night, or parallel agents.
- Planning work: it takes small `ready` issues only, not specs or epics.
- Creating the `ready` and `needs-human` labels or the board. That is covered by
  the Scrum-board spec (`docs/specs/2026-10-21-scrum-board.md`).
- Notifications for anything other than main CI being red.
- Getting issues over the crest: that is the product manager's and the
  stakeholder's work, before `ready`.
- A lens for `/retro` (was a way forward possible, were we enabled with tools,
  time and know-how, were we supported). It applies to every retro, not only
  the night shift's, so it belongs in the `/retro` skill, not here.

## Open questions
1. **Should night-shift PRs auto-merge?** In agent-os, `principal-review`
   auto-merges an approved PR that changes no protected file
   (`docs/decisions/2026-10-11-merge-authority.md`, *observed*). A night-shift
   PR is opened from the same repository, so it would be reviewed and could
   auto-merge with nobody awake. Two things make that riskier than a daytime
   PR (*inferred*):
   - The PR was written by an agent that read public issue text, and the
     reviewer then reads that PR's description. A prompt injection could travel
     from the issue to the reviewer.
   - In agent-os, almost every code fix is under `tools/`, which is protected,
     so auto-merge would rarely apply here; in other projects it would apply
     often.

   *Recommendation:* version 1 waits for the stakeholder. Every night-shift PR
   is a draft, so `principal-review` skips it (`.github/workflows/principal-review.yml`,
   *observed*: the review job runs only when the PR is not a draft). When the
   stakeholder marks it ready, the normal review and merge rules apply. Revisit
   once `/retro` shows a record of night PRs that needed no changes.
2. **Public issues and the charter.** Both repositories are public, so anyone
   can file an issue or comment. The charter says: "Agents that read untrusted
   content (web pages, issues, emails) do not get secrets or open network access
   in the same session." The night shift reads issues and holds a GitHub
   credential, so it needs a named exception to that rule. The first draft used
   the stakeholder's admin login; this one uses the App's token (Hard limits). Labels limit which issues are taken, not who can write in them:
   - an issue's author can edit its body after it is labelled `ready`;
   - anyone can comment on it.

   This draft builds in:
   - a GitHub App token limited to this repository, with the stakeholder's own
     credentials kept out of the session (decision request, option D);
   - taking only issues filed, and labelled, by collaborators;
   - reading only collaborators' text;
   - refusing an issue edited after it was labelled.

   **Answered by the stakeholder (2026-10-21):** "I should handle all issues
   from people outside us - I can be that final gate." Outside issues never
   reach the night shift directly. The stakeholder reads them, and turns
   accepted work into an issue they file and label `ready` themselves.

   Still open: whether these limits are enough for a named exception to the
   charter.

   The merge-authority decision also says to revisit it all if the repository
   goes public, and it now is. Escalated:
   `docs/decisions/2026-10-21-public-repo-and-night-shift.md`.
3. **Is dope-tdd required?** Agent OS lists dope-tdd as optional (README.md,
   *observed*). This spec makes it required for the night shift, because
   unattended code needs a test-first guard. *Assumption:* a project without it
   gets no night shift.
4. **Which issues count as small enough?** `ready` is the stakeholder's call
   today. The Scrum-board spec proposes who sets it and how. This spec adds
   that a `ready` issue must be past the crest, with the three headings the
   picker checks. *Recommendation:* add "the first failing test is named" to
   the Scrum-board spec's Definition of Ready in its own PR, so both specs
   agree.
