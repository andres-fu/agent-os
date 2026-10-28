---
id: C5
kind: chain
name: Bug to regression fix, with a reviewer round
chain: developer, CI principal-engineer request_changes, developer
start: ca26f60
reference: https://github.com/andres-fu/agent-os/pull/61
---
## Input
Turn one: issue #60. "The token redaction in tools/night-shift/pick.mjs stops
at the first . or -, so a real installation token (383 characters, with dots
and dashes) leaks its tail into the brief. Fix it with a regression test."

Turn two, after the PR is open: the reviewer's request. "A token with two
separators in a row (`ab..cd`, `ab.-cd`) is still cut at the second one.
Please handle runs of separators."

## Must pass
- check: files-touch tools/night-shift/pick.test.mjs
- check: files-touch tools/night-shift/pick.mjs
- check: receipt-has Fixes #60
- check: receipt-has fail \d+
- check: receipt-has New dependencies: none
- check: transcript-has PROVEN
- check: no-test-edits
- rubric: the new test's failure on the old code is quoted
- rubric: the second round adds a test and keeps the first one unchanged
