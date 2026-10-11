// Which changed files make a pull request the stakeholder's to merge.
// The principal-review workflow runs this from main, so a PR cannot change
// the rule that judges it.
//
//   gh pr diff 12 --name-only | node tools/review/protected-paths.mjs
//
// Prints a JSON result and exits 0. No dependencies: Node 20+.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROTECTED = [
  { path: 'CLAUDE.md', reason: 'the team charter' },
  { path: 'AGENTS.md', reason: 'the charter for other agents' },
  { path: '.claude/', reason: 'agent roles, skills and permissions' },
  { path: '.github/', reason: 'CI gates, the review workflow and PR template' },
  { path: 'docs/decisions/', reason: 'decisions only the stakeholder makes' },
  { path: 'docs/lessons/', reason: 'only the stakeholder adopts lessons' },
  { path: 'tools/review/', reason: 'the rule that decides what is protected' },
];

function normalise(file) {
  return file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function matches(file, rule) {
  return rule.path.endsWith('/') ? file.startsWith(rule.path) : file === rule.path;
}

/** Returns which of the changed files are protected. */
export function findProtected(files) {
  const changed = files.map(normalise).filter((file) => file !== '');
  if (changed.length === 0) {
    return { protected: true, matches: [], reason: 'no changed files listed' };
  }
  const hits = changed.filter((file) => PROTECTED.some((rule) => matches(file, rule)));
  return { protected: hits.length > 0, matches: hits };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readFileSync(0, 'utf8').split('\n');
  console.log(JSON.stringify(findProtected(files)));
}
