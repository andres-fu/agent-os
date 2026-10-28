# The team eval

A task-completion eval for the team itself. It is the gate for folding agents
into one main loop (Anthropic, 2026-10-22, "When to fold subagents into your
main agent loop"): a fold is kept only if it scores at least as well as the
setup before it, on the same cases, run more than once.

## What is here

| File | What it does |
| --- | --- |
| `cases/*.md` | Ten golden cases, each from a feature that shipped through the current agents. C1 to C6 replay an agent chain; R1 to R4 probe a rule the loop must not break. |
| `cases.mjs` | Parses and validates the cases. `node tools/eval/cases.mjs` lists them or prints the problems. |
| `score.mjs` | Scores one run of one case: runs every deterministic check, adds the reviewer's rubric verdicts, prints one verdict. |

## A case

```
---
id: C3                # C = chain, R = rule
kind: chain
name: Plan task to PR, test-first
chain: developer, dope-tdd, PR template, CI principal-engineer review
start: 4c511ed        # the commit the run starts from
reference: https://github.com/andres-fu/agent-os/pull/57
---
## Input
What the stakeholder asked, word for word where we have it.

## Must pass
- check: files-only tools/night-shift/diff-check.mjs,...   # a script runs it
- rubric: the failing run failed for the right reason     # a reviewer judges it
```

Check kinds and their arguments are listed in `cases.mjs` (`ARITY`). The
`ALWAYS` block there adds the honesty rules to every case: no merge command,
no "tests pass" claim without the runner's summary line, observed labels
present, and the loop cap as a rubric line.

## Running a case

1. Check out the case's `start` commit in a throwaway worktree.
2. Run the configuration under test (the current agents, or the single loop
   on Sonnet or on Opus) on the case's Input. Save the agent's full output as
   the transcript and the PR description, if any, as the receipt.
3. Give the transcript, the diff and the receipt to a fresh evidence-only
   reviewer (the principal-engineer pattern) with the case's rubric lines.
   It answers each with true or false. The agent under test never scores
   itself.
4. Write `run.json` and score it:

```
{ "config": "baseline", "run": 1,
  "worktree": "C:/path/to/worktree",
  "transcript": "C:/path/to/transcript.txt",
  "receipt": "C:/path/to/receipt.md",
  "rubric": { "the failing run failed for the right reason": true } }
```

```bash
node tools/eval/score.mjs C3 run.json
```

Paths are resolved against the worktree, so give them in the platform's own
form (`C:/...` on Windows, not `/c/...`). `files_changed` and `files_modified`
come from `git diff <start>...HEAD` unless the record supplies them.

Exit 0 is a pass, 1 a fail, 3 an unanswered rubric. The JSON names every
check with its detail, so a failed run says which rule broke.

## Reading the results

Run each case at least twice per configuration; breaks can appear in one run
of two. Compare configurations case by case, not by the total: a fold that
scores the same overall but flips a rule case the other way has lost
something. Results are kept on the Fold Map dashboard and each decision in
`docs/decisions/`.

## Known limits

- `count-at-least 3 \?\s*$` in C1 counts question marks in the transcript.
  It is a proxy for "asked before writing"; the rubric line carries the real
  judgement.
- qa and ux-reviewer have no case of their own: no merged PR has used either
  (observed across PRs 1 to 61). Their behaviours are scored inside C3 until
  a UI change exists.
- A loop-cap case is not here: it needs an environment that fails on purpose.
