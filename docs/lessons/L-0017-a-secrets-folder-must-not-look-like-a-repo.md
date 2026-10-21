---
id: L-0017
title: A secrets folder whose name looks like a repository's gets the secret saved into the repository
date: 2026-10-21
project: agent-os
kind: mistake
status: proposed
rule: Give a secret's home folder a name that cannot be mistaken for a repository, create it for the person with a command rather than asking them to type a path, and make every repository ignore private-key files.
enforced_by: none
evidence:
  - https://github.com/andres-fu/agent-os/pull/23
  - commit:470f27e
---

## What happened
Setup told the stakeholder to save the GitHub App's private key in
`~/.agent-os/`. The repository is `~/agent-os/`, the same name without the dot,
and Windows Explorer makes dot-folders awkward to create. The key was saved
into the repository folder. It was untracked but not ignored, so one
`git add -A` would have pushed it to a public repository. It was caught because
the stakeholder asked whether it would be ignored. It was never committed;
git history was checked.

## What we changed
The key was moved to `~/.agent-os/`. The repository now ignores `*.pem`,
`*.key` and `.agent-os/` (commit 470f27e), and a test file showed as ignored.
Still open: a setup command that creates the folder and moves the key, and a
less look-alike folder name.
