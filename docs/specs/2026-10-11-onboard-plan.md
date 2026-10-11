---
title: Plan for /onboard - a plain-language kickoff that adapts the team to a new project
spec: docs/specs/2026-10-11-onboard.md (status: approved, 2026-10-11; v1 = 16 ACs in 2 PRs)
status: draft        # draft | approved. Goes to principal-engineer and security-compliance first.
classification: non-trivial
owner: engineering-manager
date: 2026-10-11
---

## Classification and review
**Non-trivial** (12 tasks, new interfaces): `principal-engineer` and
`security-compliance` (personal data, CI, LLM reads a person's text) review it
before any developer starts. It is under `docs/specs/`: the stakeholder merges. Read (*observed*):
`CLAUDE.md`, lessons index, merge authority, `_template.md`, `/escalate`, `gates.yml`, `lessons.mjs`, `protected-paths.mjs`.

## Approach
The model talks; tested Node scripts write and judge. The skill (Sonnet) calls
`tools/onboard/*.mjs` for every write and status check. Scripts follow
`lessons.mjs`: pure exports, a thin CLI, `{ ok, value } | { ok: false, error }`,
and import its `parseFrontmatter` (no second parser).

**Rejected: the skill edits files itself.** A model cannot guarantee AC-6/AC-11
byte identity, generating must cost no tokens, and free writes to protected
files are the L-0002 bypass.

## Shared conventions
- Node 20+ ES modules, `node:` built-ins only: **no new dependencies**.
- Exit `0` done/`unchanged`, `1` invalid or refused, `2` usage, `3` BLOCKED.
  Stderr for messages; stdout text or `--json`. `--root DIR` (default cwd).
- Strip BOM, normalise CRLF; on write restore EOL and BOM; skip unchanged bytes.
- Answers on stdin or `--answer-file`, never argv. Warnings never echo a match.

## Interfaces and contracts

### Intake template `.claude/skills/onboard/intake-template.md` (T1.1)
Blocks in **ask order Q1, Q2, Q3, Q4, Q6, Q5, Q7, Q8, setup**, each
`<!-- onboard:<id> part=<Part> -->`...`<!-- /onboard:<id> -->` with a `### Qn.`
heading, `Example:`, a "don't know" line, `Answer:` and `Made up:` (blank or
`yes`). `PRIVACY_WARNING` precedes Q1, Q6 and Q5. Q6 is the spec's wording (25
words), plus `Decision: <path or blank>` and checkbox ids `names birthdates
id-numbers diagnoses test-scores disability-or-special-education children health
mental-health family school payment none dont-know`.
- Word count (AC-2): `heading.trim().split(/\s+/).length <= 25`, so
  "special-education" is one word.
- Banned terms (AC-2): case-insensitive, whole-word (`\b`), over the whole
  block; "special" and "test scores" must not match.
- States `open`/`dont-know`/`answered`; Q6 is `open` with no box ticked, and
  `none` plus another box is invalid. A new answer clears its `Made up:`.
  Answers may not contain `<!-- onboard:`; intakes over 256 KiB are invalid.

### `tools/onboard/intake.mjs` (T1.1)
```js
export const PRIVACY_WARNING;               // string
export const ASK_ORDER;                     // ['Q1','Q2','Q3','Q4','Q6','Q5','Q7','Q8','setup']
export function parseIntake(text)           // -> { ok, value: Intake } | { ok:false, error }
export function createIntake(templateText)  // -> string
export function recordAnswer(text, id, { answer, dontKnow, data, decision, madeUp }) // -> { ok, value, changed }
export function recordSetup(text, { summary, confirmed /* 'yes'|'no' */ })        // same
// Intake = { questions: [{ id, part, heading, state, answer, madeUp, data?, decision? }], setup }
```
```
node tools/onboard/intake.mjs create [--root DIR]               # 1 if it exists
node tools/onboard/intake.mjs record <Q1..Q8|setup> [--root DIR] [--dont-know]
     [--data id,id] [--decision PATH] [--made-up] [--confirm yes|no] [--answer-file PATH]
```

### `tools/onboard/identifiers.mjs` (T1.2)
`findIdentifiers(text) -> [{ kind: 'email'|'phone'|'id-number'|'date' }]`.
Linear, literal patterns: email; phone (10-15 digits with `+ . - ( )` or
spaces); id-number `\d{8,}` or `\b\d{3}-\d{2}-\d{4}\b`; date `YYYY-MM-DD`,
`M/D/YYYY`, `Month D, YYYY`. `20261011` is reported (as id-number).

### `tools/onboard/data-gate.mjs` and `git-main.mjs` (T1.3)
```js
// data-gate.mjs
export const HIGHLY_SENSITIVE_CATEGORIES; // the only copy of spec "Decided on approval" item 3:
// children: [children]; diagnoses or test scores: [diagnoses, test-scores];
// disabilities or special education: [disability-or-special-education];
// health incl. mental health: [health, mental-health]; payment: [payment];
// ID numbers, government or student: [id-numbers]   -> [{ category, options }]
export function dataGate(intake, { readMain }) // readMain(path) -> { found: boolean, text?: string }
// -> { blocked: false } | { blocked: true, decision: string|null, reason: string }
// git-main.mjs
export function readFromOriginMain(root, path) // -> { found, text? }
```
Gate rules, all fail closed:
- Q6 `open` -> blocked, reason `Q6 is not answered` (AC-17).
- Q6 `dont-know`, or any highly sensitive id -> blocked unless the recorded
  decision, **as read from `origin/main`**, has `status: decided` and
  `onboard_outcome: build` (first token of each value, so `# comments` are
  ignored). Reasons: `no decision recorded: run /escalate`,
  `not on origin/main: run git fetch origin`, `not decided yet`,
  `decision is not to build`.
- Decision path must match `^docs/decisions/[A-Za-z0-9._-]+\.md$`, else invalid.
- `readFromOriginMain`: `execFileSync('git', ['show', 'origin/main:' + path], { cwd: root })`,
  no shell, never the working copy; any failure is `{ found: false }`.
- The skill adds a blank `onboard_outcome:` to the decision it raises; the
  stakeholder sets `build` or `do-not-build`. `_template.md` is unchanged.

### `tools/onboard/check.mjs` (T1.4)
```js
export function intakeStatus(intake, gate) // -> { gate, next, open: {Discovery,Data,Guardrails,Setup}, followUps: {...} }
export function validateProject(root, { strict }) // -> { errors: string[], warnings: [{ file, question, kind }] }
```
```
node tools/onboard/check.mjs status   [--root DIR] [--json]   # 0, 1 invalid, 3 BLOCKED
node tools/onboard/check.mjs validate [--root DIR] [--strict] [--json]
```
**One status format for every case** (PE advice; AC-5, AC-9, AC-16, AC-17).
Line 1 is always the gate; the open-question groups always follow:
```
BLOCKED: awaiting decision docs/decisions/2026-10-12-data.md (not on origin/main: run git fetch origin)
Next: none (raise /escalate before asking Q5)
Still open
  Discovery: Q5
  Guardrails: Q7, Q8
  Setup: confirmation
Follow-ups (answered "don't know")
  Data: Q6
```
Otherwise line 1 is `BLOCKED: awaiting decision (<reason>)`, `READY: no decision
needed` or `READY: <path> says build`. `Next:` is the first open id in
`ASK_ORDER`, but never past Q6 while blocked. Empty groups are omitted.

`validate` scans every answer, the setup summary and other `docs/project/` files
(no marker, so any match counts). Matches warn; `--strict` exits 1 on any not
marked `Made up: yes`. No `docs/project/`: exit 0. It never calls git.

### CI job in `.github/workflows/gates.yml` (T1.6)
Job `project-data` ("project files have no real identifiers"): the existing
pinned checkout and setup-node SHAs (L-0007), `contents: read`, then
`node tools/onboard/check.mjs validate --strict`. **No `paths:` filter**, so a
required check is never left pending (*inferred*). No new action or permission.

### PR 2 contracts
- `backlog.mjs`: `renderBacklog(slices) -> string`, `validateBacklog(text) ->
  { errors }`. Input `{"slices":[{"text","doneWhen","next"}]}`. Lines
  `- [next] Sentence.` / `- [ ] Sentence.` plus `  Done when: ...`. 3-7 slices,
  one sentence each, non-empty `Done when`, exactly one `[next]`.
- `team.mjs`: `renderTeam({ roles }) -> string`, roles = sorted `name:` of
  `.claude/agents/*.md`. Mermaid `flowchart` plus numbered text, both naming the
  person with the problem, the stakeholder and every role; no real names.
- `claude-section.mjs`: `applySection(claudeText, body) -> { ok, value, changed }`; markers
  `<!-- onboard:project:start -->` and `<!-- onboard:project:end -->`: none, append; one each in order, replace; else error. Body <= 100 words.
- `node tools/onboard/generate.mjs [--root DIR] [--slices PATH|-] [--replace-backlog]`:
  invalid or incomplete intake 1; gate blocked 3, prints status line 1, writes
  nothing (AC-9 clause); a changed existing backlog 1 unless
  `--replace-backlog`. Writes only changed files; never the intake.

## Tasks
Waves run in order; a wave's tasks run in parallel, share no file, at most 3 at once. Test first, seen failing.

### PR 1: "onboard: skill, intake, status and validate, sensitive-data stop, CI check"
Touches `.claude/`, `tools/`, `.github/` and `package.json`, all protected, so
**the stakeholder merges PR 1**. Security review: yes (personal data, CI, LLM).

| Task | Wave | Files it may change | ACs | First failing test |
| --- | --- | --- | --- | --- |
| T1.1 Template and intake library | A | `.claude/skills/onboard/intake-template.md`, `tools/onboard/intake.mjs`, `tools/onboard/intake.test.mjs`, `tools/onboard/template.test.mjs` | AC-2, AC-6 | `template.test.mjs`: Q6 heading is 25 words with "special-education" as one; "CI" does not match "special" |
| T1.2 Identifier detector | A | `tools/onboard/identifiers.mjs`, `tools/onboard/identifiers.test.mjs` | AC-10 | `20261011` and `123-45-6789` are reported; result has no matched text |
| T1.3 Data gate, origin/main reader | A | `tools/onboard/data-gate.mjs`, `tools/onboard/git-main.mjs`, `tools/onboard/data-gate.test.mjs`, `tools/onboard/git-main.test.mjs` | AC-16 (unit), AC-9 (gate) | decision `decided` in the working copy but absent on `origin/main` stays blocked with the fetch reason (temp `git init` repo, `git update-ref refs/remotes/origin/main`) |
| T1.4 Status and validate CLI | B | `tools/onboard/check.mjs`, `tools/onboard/check.test.mjs` | AC-5, AC-9 (status), AC-16 (CLI), AC-17, AC-18 (script) | Q1-Q3 answered: exit 3, line 1 `BLOCKED: awaiting decision`, then Q4, Q5, Q6, Q7, Q8 and Setup grouped by part |
| T1.5 The `/onboard` skill | B | `.claude/skills/onboard/SKILL.md`, `tools/onboard/skill.test.mjs`, `README.md` (one line in "Adopting it in a project") | AC-1, AC-3, AC-4 | `skill.test.mjs`: frontmatter `name: onboard`, `model: sonnet`; warning before Q1, Q6 and Q5 in both files |
| T1.6 Protect the intake; CI job; test script | B | `tools/review/protected-paths.mjs`, `tools/review/protected-paths.test.mjs`, `.github/workflows/gates.yml`, `tools/onboard/ci.test.mjs`, `package.json` | AC-8, AC-18 (wiring) | `protected-paths.test.mjs`: `docs/project/intake.md` protected, `backlog.md` and `team.md` not |

Notes:
- T1.1 builds CRLF/BOM fixtures in code. T1.3 table-tests each category (every
  option is a Q6 id; only it ticked blocks); T1.4 repeats it via the CLI, and
  tests `--strict`: fails unmarked, passes `Made up: yes`, fails after an edit.
- T1.5 skill: `allowed-tools` Read, Glob, Grep, `Bash(node tools/onboard/*)`;
  ask in `ASK_ORDER`, one at a time, saving each; run `status` after Q6 and stop
  before Q5 if blocked; plus every AC-1/3/4 item and a closing screen of at most
  5 lines naming the intake PR for the stakeholder.
- T1.6 edits an existing test (`test-edits` flags it; receipt says why).
  `ci.test.mjs`: job present, `validate --strict`, no `paths:`, known SHAs only.
- **AC-18 rollout (L-0011):** after PR 1 merges, QA opens a throwaway PR whose
  intake has an unmarked made-up email (link red run), marks it (link green
  run), closes it unmerged; then the stakeholder makes the check required.

### PR 2: "onboard: backlog, team diagram and CLAUDE.md section"
Touches `tools/`, `.claude/`, `package.json`: the stakeholder merges it.
agent-os's `CLAUDE.md` is untouched (temp fixtures). Security review: yes.

| Task | Wave | Files it may change | ACs | First failing test |
| --- | --- | --- | --- | --- |
| T2.1 Backlog | A | `tools/onboard/backlog.mjs`, `tools/onboard/backlog.test.mjs` | AC-12 | two `[next]` slices is an error |
| T2.2 Team diagram | A | `tools/onboard/team.mjs`, `tools/onboard/team.test.mjs` | AC-13 | Mermaid and text both name every role in a fixture `agents/` dir |
| T2.3 CLAUDE.md section | A | `tools/onboard/claude-section.mjs`, `tools/onboard/claude-section.test.mjs` | AC-11 (markers, 100 words) | a CRLF CLAUDE.md is byte-identical outside the markers |
| T2.4 Generate and wiring | B | `tools/onboard/generate.mjs`, `tools/onboard/generate.test.mjs`, `package.json` | AC-11, AC-9 (backlog clause) | blocked intake: exit 3, no file written, no `[next]` anywhere |
| T2.5 No-network check | B | `tools/onboard/no-network.test.mjs`, `tools/onboard/test-support/deny-network.mjs` | AC-15 | a fixture importing `node:https` fails the scan |
| T2.6 Skill's generate step | B | `.claude/skills/onboard/SKILL.md`, `tools/onboard/skill.test.mjs` | AC-1, AC-4 (kept green) | skill names `generate.mjs` and still says never merge |

Notes:
- T2.4 snapshots a temp repo around two `generate` runs; adds PR 2's tests to `package.json`.
- T2.5 scans `tools/onboard/**/*.mjs` for `http(s|2)`, `net`, `tls`, `dgram`,
  `dns`, `child_process`, `worker_threads` (with or without `node:`), `fetch(`,
  `WebSocket`, `EventSource`, except `child_process` in `git-main.mjs` and
  tests. Then it reruns the onboard tests under `node --test --import
  ./tools/onboard/test-support/deny-network.mjs` (socket connect, `dns.lookup`
  and `fetch` throw). That is how CI removes the network, in the `tests` job.
- T2.6 edits PR 1's skill test (`test-edits` flags it; receipt says why).

## AC coverage
| AC | Task | Test file | AC | Task | Test file |
| --- | --- | --- | --- | --- | --- |
| AC-1 | T1.5 | `skill.test.mjs` | AC-10 | T1.2 | `identifiers.test.mjs` |
| AC-2 | T1.1 | `template.test.mjs` | AC-11 | T2.4 (T2.3) | `generate.test.mjs`, `claude-section.test.mjs` |
| AC-3 | T1.5 | `skill.test.mjs` | AC-12 | T2.1 | `backlog.test.mjs` |
| AC-4 | T1.5 | `skill.test.mjs` | AC-13 | T2.2 | `team.test.mjs` |
| AC-5 | T1.4 | `check.test.mjs` | AC-15 | T2.5 | `no-network.test.mjs` |
| AC-6 | T1.1 | `intake.test.mjs` | AC-16 | T1.3, T1.4 | `data-gate.test.mjs`, `check.test.mjs` |
| AC-8 | T1.6 | `protected-paths.test.mjs` | AC-17 | T1.4 | `check.test.mjs` |
| AC-9 | T1.3, T1.4; backlog clause T2.4 | `data-gate.test.mjs`, `check.test.mjs`, `generate.test.mjs` | AC-18 | T1.4, T1.6 | `check.test.mjs`, `ci.test.mjs`, plus QA's linked runs |

AC-7, AC-14 removed. Not in v1: autonomy levels, any `principal-review` change,
the CI `tests` job generator, lesson import, `docs/landscape.md` updates.

## What enforces each protection (L-0010)
| Protection | Enforced by |
| --- | --- |
| Real-looking identifiers do not reach `main` | **Gate**: `project-data` job; **GitHub ruleset** only once the stakeholder makes it required. Before that, advisory. It cannot detect names or stories |
| Secrets do not reach `main` | **Gate**: existing gitleaks job, which scans the intake |
| Real data is not typed into the interview | **Instruction only**: the skill's three warnings. No check sees chat text |
| Q6 is asked before Q5 | **Test**: template order = `ASK_ORDER`, and `status` gives `Next: none` once blocked. The asking itself: **instruction** |
| The build stops on sensitive, "don't know" or blank Q6 | **Scripts**: `status` and `generate` exit 3. An agent hand-writing files bypasses them: then **instruction** plus the stakeholder's review of the protected intake |
| The decision counts only once on `main` | **Script**: `git-main.mjs` reads `origin/main`. A hand-edited local ref bypasses it (*inferred*); `docs/decisions/` being protected limits what can be on real `main` |
| The intake changes only with the stakeholder | **Gate + ruleset**: `protected-paths.mjs` run from `main` by `principal-review`, and the required `principal-engineer` status. Agents merging by hand: instruction and deny list only (merge-authority decision) |
| A PR cannot weaken the validate check unseen | **Partly**: `gates.yml` runs the PR's own copy on `pull_request`, so the run itself can be weakened; `.github/` and `tools/` are protected, so the stakeholder reviews it |
| Onboarding scripts use no network | **Gate**: `no-network.test.mjs` in the `tests` job. The interview's "no web" is instruction plus `allowed-tools` (whether honoured: *unknown*, L-0003) |
| Answers never become shell arguments | **Script** CLI design (stdin or file only); the skill's heredoc use is instruction |

## Risks
| Risk | What we do |
| --- | --- |
| Real sensitive data committed to the intake (history is hard to clean; repo may be public) | Warnings, detector, strict CI check, never echoing matches, gitleaks, stakeholder review. Residual risk stated in the skill |
| Stale `origin/main` or a dated backlog line blocks needlessly | Fail closed; the reason says what to do; open question 3 |
| A required check with a bug blocks every PR | L-0011 rollout above; required only after linked red and green runs |

**Escalate** if a task needs a dependency, action or permission; `lessons.mjs` must change; security wants
rules beyond "flag and stop"; or `onboard_outcome` is rejected. Off-plan writes or untestable ACs: `BLOCKED:`.

## Open questions for the principal engineer's plan review
1. `git-main.mjs` shells out to `git show` (no shell): OK as the one AC-15 exception?
2. `onboard_outcome: build | do-not-build` in the raised decision: OK as "a decision not to build"?
3. Strict validate fails on any match in non-intake `docs/project/` files: keep, or intake only?
4. Add a script backstop (`record Q5` refuses while blocked), coupling `intake.mjs` to git?
5. Blocked `generate` writes nothing: does that meet AC-9's "marks no slice as next"?
6. Is a throwaway PR, closed unmerged, enough L-0011 evidence before AC-18 is required?
7. PR 1's skill has no generate step until T2.6: OK to run `/onboard` between the PRs?
