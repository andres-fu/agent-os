---
id: L-0009
title: An annotated tag's SHA is not a commit; pin to the commit it points at
date: 2026-10-11
project: agent-os
kind: tool-quirk
status: proposed
rule: When pinning an action, use the `^{}` line from `git ls-remote --tags`, which is the commit; the plain tag line of an annotated tag is the tag object.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/4
---

## What happened
`git ls-remote --tags` for anthropics/claude-code-action v1.0.248 printed two
lines: `7806b44…` for the tag and `1d6de8c…` for `v1.0.248^{}`. The first is the
annotated tag object, not a commit. Pinning to it would have pointed `uses:` at
something that is not a commit.

## What we changed
The workflow pins `1d6de8c…`, the commit, with the version as a comment.
