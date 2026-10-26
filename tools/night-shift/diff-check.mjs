// May the night shift push this branch? Fails on any file that governs the
// night shift or the team, and on any dependency file.
//
//   git diff --name-only --no-renames -z origin/main...HEAD | node tools/night-shift/diff-check.mjs
//
// Prints { ok, forbidden } and exits 1 when anything is forbidden, or when
// the diff is empty. No dependencies: Node 20+.
//
// This is narrower than PROTECTED in protected-paths.mjs, which covers all of
// tools/ and would block almost every fix in agent-os. Merge authority still
// comes from PROTECTED; this only decides what the night shift may push.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { matches, normalise } from '../review/protected-paths.mjs';

export const FORBIDDEN = [
  { path: 'CLAUDE.md', reason: 'the team charter' },
  { path: 'AGENTS.md', reason: 'the charter for other agents' },
  { path: '.claude/', reason: 'agent roles, skills and permissions' },
  { path: '.github/', reason: 'CI gates, the review workflow and PR template' },
  { path: 'docs/decisions/', reason: 'decisions only the stakeholder makes' },
  { path: 'docs/lessons/', reason: 'only the stakeholder adopts lessons' },
  { path: 'docs/specs/', reason: 'specs only the stakeholder approves' },
  { path: 'tools/night-shift/', reason: 'the night shift instructions and scripts' },
  { path: 'tools/review/protected-paths.mjs', reason: 'the protected-paths rule' },
  { path: 'tools/guard/', reason: 'the branch guard' },
  { path: 'dope-tdd.json', reason: 'the test-first guard settings' },
  // A trailing * matches any name at the root that starts with the stem:
  // .gitleaks.toml, .gitleaksignore and a .gitleaks/ folder alike.
  { path: '.gitleaks*', reason: 'the secret scanner settings' },
  { path: '.semgrep*', reason: 'the static analysis settings' },
  { path: '.mcp.json', reason: 'the tool servers agent sessions in this repository load' },
];

// Forbidden by base name at any depth: a nested package.json is still a
// dependency change for that package, and a nested .npmrc its npm settings.
export const DEPENDENCY_FILES = [
  '.npmrc',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

function isForbidden(file) {
  const lower = file.toLowerCase();
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  if (DEPENDENCY_FILES.includes(base)) return true;
  return FORBIDDEN.some((rule) => {
    const path = rule.path.toLowerCase();
    return path.endsWith('*') ? lower.startsWith(path.slice(0, -1)) : matches(lower, { path });
  });
}

/** Checks NUL-separated file names from `git diff --name-only -z`. */
export function checkDiff(input) {
  const files = input.split('\0').map(normalise).filter((file) => file !== '');
  if (files.length === 0) {
    return { ok: false, forbidden: [], reason: 'no changed files listed' };
  }
  const forbidden = files.filter(isForbidden);
  return { ok: forbidden.length === 0, forbidden };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDiff(readFileSync(0, 'utf8'));
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
