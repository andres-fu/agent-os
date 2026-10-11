---
id: L-0007
title: Pin CI actions and images to exact commits, not tags
date: 2026-10-11
project: agent-os
kind: mistake
status: proposed
rule: Reference every GitHub Action by its full commit SHA (with the version as a comment) and every container image by digest.
enforced_by: gate
evidence:
  - https://github.com/andres-fu/agent-os/actions/runs/38163459462
---

## What happened
The first run of this template's own `gates` workflow failed its static-analysis
gate with 10 blocking findings: every action was referenced by a tag like
`actions/checkout@v4`. A tag can be repointed by its owner, which is how the
trivy-action and kics-github-action supply-chain compromises happened.

## What we changed
Every action is pinned to a full commit SHA found with `git ls-remote --tags`,
with the version as a comment. While pinning, checkout and setup-node were also
upgraded from v4 to v7.0.1 and v7.1.0, which moves them off the deprecated
Node 20 runtime; gitleaks-action stays on v2 (v2.3.9). The Semgrep image is
pinned to the `latest` digest that run used. The gate that caught it stays on,
so it cannot come back.
