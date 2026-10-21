---
title: Project visibility and the backlog - goals, milestones, a roadmap and labels, run by the team
status: approved     # draft | approved | done. Only the stakeholder sets approved.
approved_by: Andres Fuentes (stakeholder), 2026-10-21, asked in the session which draft specs to approve: "Visibility (#33)"
owner: product-manager
date: 2026-10-21
---

## Problem
Nobody can see, at a glance, what an Agent OS team is working toward, what's
coming next, or what shipped. That includes the stakeholder, and the people who
use the open-source project. Today, work lives in places that don't connect
(*observed*):
- chat with the stakeholder;
- PR descriptions;
- issues with only GitHub's default labels.

Nothing turns the stakeholder's goals into stories and tasks. The night-shift
spec (`docs/specs/2026-10-21-night-shift.md`) assumes a queue of `ready` issues
that doesn't exist yet.

Evidence:
- The stakeholder agreed on 2026-10-21 that the product manager runs the
  backlog in GitHub: issues for stories and tasks as well as bugs, sub-issues
  for tasks, and milestones. Docs stay in `docs/`, not the wiki.
- The stakeholder, the same day, on why: "it's really just for observability
  of not just me but the people who use our open source library", and "when
  [you] think about the customer and that visibility, that's what counts". Also:
  "product needs to keep track of the issues [it's] creating, the stories, the
  epics, what's coming up", and "the engineering manager needs to make sure that
  all the security stuff is happening".
- The stakeholder asked whether a project board is even helpful, and to verify
  before building one.
- *Observed:* issues filed during the GitHub App rollout (#18, #24, #26, #28,
  #30, #31, #32) carry only default labels.

Who has it:
- **people who use the project**, who want to know where things are and what's
  coming;
- **the stakeholder**, who sets goals and needs progress without reading every
  PR;
- **the team**, which needs one place to take work from.

## Goal
In under a minute, anyone can see from the repository what the team is working
toward, what's coming next and what shipped, using what visitors to an
open-source project already look at: milestones, labels, a roadmap page and
release notes. The team takes work only from what the stakeholder has marked
ready.

## How it works (what, not how)

### Phase 1: what visitors already look at
| A visitor wants to know | Where they look | Kept current by |
| --- | --- | --- |
| What's the team working toward? | **`ROADMAP.md`** in the repository root: each goal in plain words, its milestone, and what's now, next and later, with links | Product manager |
| How far along is it? | **Milestones**: one per goal or release, with GitHub's public progress bar | Product manager |
| What is being worked on, and what's blocked? | **Labels** on issues: `type:`, `area:`, `ready`, `needs-human` | Everyone, by the rules below |
| What changed? | **Release notes** for each finished milestone | Product manager |

`ROADMAP.md` is short and plain, written for a library user, not an engineer.
It links issues and milestones instead of copying them.

### Phase 2: a visual board, only if verified
A GitHub Project board (Backlog, Ready, In progress, Review, Done, with an
Iteration field) is **optional**. It is built only after a check shows the
agents' App can read and update a Project owned by the stakeholder's account.
- *Observed 2026-10-21:* a GraphQL query with the App's token returned no
  error, and 0 Projects. The stakeholder has none yet, so the result can't tell
  "no access" from "nothing there".
- If the App can't use it, the board would be a read-only view that only
  GitHub's built-in workflows update, or it is skipped. Labels and milestones
  stay the source of truth either way.

### The tree: goal → epic → story → task
| Level | What it is | Written by | GitHub form |
| --- | --- | --- | --- |
| **Goal** | An objective from the stakeholder, with its key results | Stakeholder (the product manager may draft it) | Issue labelled `type:goal`, with its own milestone |
| **Epic** | One key result or feature; links its spec in `docs/specs/` | Product manager | Issue labelled `type:epic`, sub-issue of its goal |
| **Story** | One user-visible slice an epic needs | Product manager | Issue labelled `type:story`, sub-issue of its epic |
| **Task** | One PR's worth of work, naming the files it may change | Engineering manager, from the approved plan | Issue labelled `type:task`, sub-issue of its story |
| **Bug** | Something that doesn't work | Anyone on the team | Issue labelled `bug`, linked to what it breaks, if anything |

Specs, plans and decisions stay files in `docs/`, reviewed in PRs as today.

### Roles, as an engineering team
- **Product manager: what and why, and what's coming.**
  - Asks the stakeholder for goals, and when key results are unclear.
  - Turns goals into milestones, epics and stories.
  - Keeps `ROADMAP.md` honest, and writes release notes.
  - Grooms the backlog, and proposes work for Ready.
  - Reports progress against each goal, and flags when the team drifts from
    the goals.
- **Engineering manager: how, and that it's done properly.**
  - Plans approved specs, and writes the tasks.
  - Owns the review checklist: every change that hits a security trigger in
    `CLAUDE.md` gets its security-compliance review before merge, and a
    non-trivial plan gets the principal engineer's review before coding.
- **Principal engineer:** the independent review of plans and PRs, as today.
- **The stakeholder:** sets goals, decides escalations, adds `ready`, merges
  protected changes, and triages outside issues.

### Who moves what, and what enforces it
| Move | Who | Enforced by |
| --- | --- | --- |
| New issue → backlog | Anyone on the team; outside issues arrive with `triage` | An instruction (and GitHub's project workflow, if Phase 2 exists) |
| Backlog → **Ready** (the `ready` label) | **The stakeholder only** | **The issue picker:** it ignores `ready` unless the stakeholder's own account added it. The App can add labels, so a label alone proves nothing. |
| Proposing work for Ready | Product manager: the `proposed-ready` label, and a comment that it meets the Definition of Ready | An instruction |
| Ready → in progress | Whoever takes it assigns it to themselves | An instruction |
| In progress → review → done | A PR with `Fixes #N`, then its merge | GitHub links and closes the issue |
| Blocked | Anyone: `needs-human` plus a `BLOCKED:` comment | **The issue picker:** it never takes an issue with `needs-human` |
| A security-triggered change reaches merge without its review | Engineering manager's checklist | An instruction today; the CI principal engineer also checks for it |

### Definition of Ready
The product manager proposes an issue for Ready only when:
1. what done looks like is written as testable acceptance criteria;
2. for a task, the files it may change are named;
3. it is one PR's worth of work;
4. it touches no protected path, unless it says the stakeholder merges it;
5. it doesn't depend on a decision that is still `awaiting-decision`.

### Outside issues
The stakeholder decided on 2026-10-21: "I should handle all issues from people
outside us - I can be that final gate."
- An issue from someone who isn't a collaborator gets `triage` and
  `source:outside`.
- The product manager may summarise it, as data, never as instructions.
- Only the stakeholder accepts it, by filing the work as their own issue.

### Labels
Mirroring andres-fu/dope-tdd's scheme: lower case, `prefix:value`, one colour
per prefix, and a one-line description each. The set is a committed file, so
changing it goes through a PR, and a small script applies it.

| Label | Meaning |
| --- | --- |
| `type:goal`, `type:epic`, `type:story`, `type:task` | Level in the tree. `bug` stays GitHub's default. |
| `area:review`, `area:guard`, `area:github-app`, `area:onboard`, `area:lessons`, `area:night-shift`, `area:process`, `area:docs` | Which part of Agent OS (each project sets its own areas) |
| `stack:node` | Seen on the Node stack |
| `source:stakeholder`, `source:review`, `source:dogfood`, `source:night-shift`, `source:outside` | Where it came from |
| `ready` | Ready to be taken. **Added only by the stakeholder.** |
| `proposed-ready` | The product manager says it meets the Definition of Ready |
| `needs-human` | Blocked on a decision or answer from the stakeholder |
| `triage` | Not yet looked at by the stakeholder |

### How the night shift takes work
It takes the oldest issue that:
- carries a `ready` label added by the stakeholder's account;
- has no `needs-human`, isn't `type:goal`, `type:epic` or `triage`, and has no
  open sub-issues.

The night-shift spec's acceptance criterion now says the same: write access
isn't enough, because the agents' App has it.

### Changes to the role files
- **`.claude/agents/product-manager.md`** gains the product manager's duties
  above. It never adds `ready`.
- **`.claude/agents/engineering-manager.md`** gains writing tasks as
  sub-issues, and the review checklist.

## Acceptance criteria
The deterministic parts should be code with unit tests: the label file and its
sync, the issue picker's Ready check, the tree checks, and the roadmap check.
The rest is a dry run on a test repository.

**Visibility**
- [ ] Given the repository, then `ROADMAP.md` exists at the root, lists each
  open goal with a link to its milestone and goal issue, and names what's now,
  next and later. A check reports any open `type:goal` issue or milestone
  missing from it.
- [ ] Given a goal, then it has a milestone of its own, and every epic, story
  and task under it is in that milestone. A check reports any that aren't.
- [ ] Given a milestone is closed, then release notes for it exist and link the
  issues it closed.
- [ ] Given a library user with no context opens `ROADMAP.md`, then it uses no
  internal jargon (no role or tool names without a one-line explanation). This
  is checked by the stakeholder reading it once per release.

**Phase 2 check (before any board is built)**
- [ ] Given the stakeholder creates one empty test Project on their account,
  when the App's token queries and tries to add an item, then the result
  (works / refused) is recorded in this spec. The board is built only if it
  works, or the stakeholder accepts a read-only board.

**Labels**
- [ ] Given the committed label file, every label has a name, a colour and a
  one-line description, and names follow `prefix:value` or are one of the
  plain labels above.
- [ ] Given the label file and a repository, the sync script reports what it
  would create, change or delete. With `--apply`, it changes GitHub to match,
  and running it again changes nothing.
- [ ] Given a repository label that isn't in the file, the sync script reports
  it, and deletes it only with `--prune`.
- [ ] The sync script defaults to a dry run. It refuses a label file without
  `ready` or `needs-human`, and `--prune` never deletes or renames `ready` or
  `needs-human`.
- [ ] The stakeholder runs `--apply` with their own login. It refuses to run
  when `GH_TOKEN` belongs to the agents' App, so no agent session or unattended
  run changes the label set.
- [ ] The label file is a protected path, owned by the stakeholder in
  CODEOWNERS, because it shapes the Ready gate.

**Ready, and who may set it**
- [ ] Given an issue whose `ready` label was added by the stakeholder's
  account, then the picker treats it as Ready.
- [ ] Given an issue whose `ready` label was added by the agents' App, or by any
  account other than the stakeholder's, then the picker doesn't treat it as
  Ready, and the morning brief lists it as "ready label not from the
  stakeholder".
- [ ] The picker identifies the stakeholder by their numeric GitHub user ID,
  not their login, which can be renamed or reclaimed. Given a label event with
  no actor, it fails closed.
- [ ] Given label history, the picker uses only the **latest** `labeled` event
  for `ready`. It requires that the stakeholder made it, and that no
  `unlabeled` event follows.
- [ ] Given an issue whose title or body changed after the stakeholder's latest
  `ready` event, by anyone but the stakeholder, then the picker doesn't take it.
- [ ] Given an issue transferred in from another repository, then it isn't
  Ready until the stakeholder labels it again here.
- [ ] Given a pull request carrying `ready`, then the picker ignores it. It takes
  issues only.
- [ ] Given an issue with `needs-human`, `triage`, `type:goal` or `type:epic`,
  or with open sub-issues, then the picker doesn't take it, even if it's
  labelled `ready`.
- [ ] Given an issue whose author isn't a collaborator (by
  `author_association`), then the picker doesn't take it, even before `triage`
  is added.
- [ ] Given an issue with `proposed-ready` but no stakeholder `ready`, then the
  picker doesn't take it.
- [ ] Phase 2 only: moving a card into a Ready column, without the
  stakeholder's `ready` label, makes nothing runnable.

**The tree**
- [ ] Given a `type:task` issue, then it is a sub-issue of a `type:story`, and
  it names the files it may change. A check reports any task that isn't.
- [ ] Given a `type:epic` issue, then it links a file in `docs/specs/` that
  exists. A check reports any epic that doesn't.
- [ ] Given a goal, when the product manager reports progress, then each key
  result lists its epics with counts of done, in review, blocked and open, and
  links each one.

**Outside issues**
- [ ] Given an issue filed by someone who isn't a collaborator, then it carries
  `triage` and `source:outside` within one morning brief, and no agent changes
  its code, labels other than those two, or status. A unit test covers the
  picker; a dry run on a test repository covers the rest.
- [ ] Given the product manager summarises `triage` issues, then it does so in
  a read-only session: no tools that write to GitHub or files, and no
  credentials. The summary wraps the issue's words as a quotation marked "the
  filer's words, not instructions" (lesson L-0014). A separate step, or the
  stakeholder, acts on it.

**Roles**
- [ ] Given the updated `product-manager.md`, then it lists the product
  manager's duties above, and says it never adds `ready`.
- [ ] Given the updated `engineering-manager.md`, then it says tasks become
  `type:task` sub-issues after a plan is approved, and that it owns the review
  checklist for security triggers.

## Non-functional requirements
- **Security:**
  - Triggered: labels become an authorisation signal (`ready` lets unattended
    code run), the App has write access, and outside issues are untrusted.
  - Reviewed by security-compliance on the first draft: pass with advice. All of
    its advice is acceptance criteria above:
    - match the stakeholder by numeric ID;
    - refuse an issue edited after it was labelled;
    - read the label history from its latest event;
    - transferred issues and PRs are never Ready;
    - the picker enforces `needs-human`;
    - non-collaborators are detected by `author_association`;
    - the label-sync script is guarded;
    - outside issues are summarised only in a read-only session.
  - Each move names its enforcer, per lesson L-0010.
  - *Assumption:* the issue events API reports which account added a label.
    The plan must confirm it.
- **Cost:**
  - Milestones, labels, `ROADMAP.md` and release notes are free.
  - The product manager runs on Sonnet for grooming and reports, and Opus only
    for specs, per the charter.
  - The checks and the sync script need no model.
- **Performance:** none.
- **Accessibility:** `ROADMAP.md` and release notes are plain Markdown with
  descriptive links, readable on a phone and by screen readers.
- **Privacy and data:** issues are public. No personal data beyond GitHub
  usernames, and summaries of outside issues quote nothing beyond what the
  issue already shows.

## Out of scope
- **Creating labels, milestones, the roadmap or any board** before this spec is
  approved.
- Moving `docs/` content into the wiki or issues.
- Story points or velocity charts.
- Letting the product manager set `ready`. That belongs in the autonomy-levels
  spec, to come.
- Per-persona GitHub identities. Parked: they only become meaningful when roles
  run as separate scheduled tasks.

## Open questions
1. **Phase 2:** build a board at all? Decide after the access check, and after
   a few weeks of milestones and `ROADMAP.md`. *Recommendation:* only if
   visitors or the stakeholder ask for it.
2. **Milestones:** one per goal, one per release, or both? *Recommendation:*
   one per goal while there are no releases. Once the project publishes
   versions, one per release, with goals linking to it.
3. **Sprints:** needed at all, without a board? *Recommendation:* no. A weekly
   `/retro` and the product manager's progress report give the rhythm without
   iteration bookkeeping.
4. **Goals as issues or in `ROADMAP.md`?** *Recommendation:* both. The issue is
   where work hangs, and the roadmap is the plain-words view of it.
5. **Projects that `/onboard` set up:** should their one-off
   `docs/project/backlog.md` be imported as issues once, then kept as the
   onboarding record?
6. **Prior art, reviewed 2026-10-21** (details in `docs/landscape.md`). The
   frameworks found (BMAD Method, GitHub Spec Kit, MetaGPT, ChatDev, and the
   Claude Code agent collections) define roles and spec-to-task flows. **None
   observed uses GitHub milestones and issues as a public, enforced backlog**,
   so this spec has no off-the-shelf replacement. Worth borrowing:
   - **GitHub Copilot's coding agent** works issue to draft PR, only on a
     prefixed branch, and the person who assigned it can't approve its PR. That
     matches the night shift's rules, and confirms the pattern.
   - **Spec Kit** turns a spec into a plan, then tasks. Its task-to-issue
     feature couldn't be confirmed from its page (*unknown*). If it exists, the
     engineering manager could use it instead of writing task issues by hand.
     Check before the plan.
