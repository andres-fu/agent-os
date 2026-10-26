import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findProtected, matches, normalise, PROTECTED } from './protected-paths.mjs';

// Specs were unprotected until 2026-10-11; they now are (see the specs test).
test('a PR that changes only code, tests and unprotected docs is not protected', () => {
  const result = findProtected(['src/app.ts', 'tests/app.test.ts', 'docs/notes.md']);
  assert.deepEqual(result, { protected: false, matches: [] });
});

test('the charter and agent manuals are protected', () => {
  assert.deepEqual(findProtected(['CLAUDE.md', 'AGENTS.md']).matches, ['CLAUDE.md', 'AGENTS.md']);
});

test('anything under .claude, .github, docs/decisions or docs/lessons is protected', () => {
  const files = [
    '.claude/agents/developer.md',
    '.claude/settings.json',
    '.github/workflows/gates.yml',
    'docs/decisions/2026-10-11-merge-authority.md',
    'docs/lessons/L-0009-x.md',
  ];
  assert.deepEqual(findProtected(files), { protected: true, matches: files });
});

test('the protection rules themselves are protected', () => {
  assert.equal(findProtected(['tools/review/protected-paths.mjs']).protected, true);
});

test('similar names outside the protected places are not protected', () => {
  const files = ['src/CLAUDE.md.bak', 'docs/decisions-old.md', 'my.github/x', 'docs/lessonsx/a.md'];
  assert.deepEqual(findProtected(files).matches, []);
});

test('Windows separators and a leading ./ are normalised', () => {
  assert.equal(findProtected(['.\\.github\\workflows\\gates.yml']).protected, true);
  assert.equal(findProtected(['./CLAUDE.md']).protected, true);
});

test('blank lines are ignored', () => {
  assert.deepEqual(findProtected(['', '  ', 'src/a.ts']), { protected: false, matches: [] });
});

test('an empty change list is treated as protected: nothing to prove it safe', () => {
  assert.deepEqual(findProtected([]), { protected: true, matches: [], reason: 'no changed files listed' });
});

test('every protected rule is documented with a reason', () => {
  for (const rule of PROTECTED) {
    assert.equal(typeof rule.reason, 'string');
    assert.ok(rule.reason.length > 0, `rule ${rule.path} has no reason`);
  }
});

test('what the CI gates run and read is protected', () => {
  const files = [
    'package.json',
    'package-lock.json',
    'tools/lessons/lessons.mjs',
    'tools/anything/new.mjs',
    '.gitleaks.toml',
    '.gitleaksignore',
    '.semgrepignore',
    '.semgrep.yml',
    '.semgrep/rules.yml',
  ];
  assert.deepEqual(findProtected(files), { protected: true, matches: files });
});

test('nested package files are not the root manifest', () => {
  assert.equal(findProtected(['apps/web/package.json']).protected, false);
});

test('the landscape is protected: the reviewer trusts it for build-or-reuse', () => {
  assert.equal(findProtected(['docs/landscape.md']).protected, true);
  assert.equal(findProtected(['docs/landscape-notes.md']).protected, false);
});

test('specs are protected: only the stakeholder approves a spec', () => {
  assert.equal(findProtected(['docs/specs/2026-10-11-onboard.md']).protected, true);
  assert.equal(findProtected(['docs/specs-archive/old.md']).protected, false);
});

test('the onboarding intake is protected; the backlog and team diagram are not', () => {
  assert.equal(findProtected(['docs/project/intake.md']).protected, true);
  assert.equal(findProtected(['docs/project/backlog.md']).protected, false);
  assert.equal(findProtected(['docs/project/team.md']).protected, false);
  assert.equal(findProtected(['docs/project/intake.md.bak']).protected, false);
});

test('the test-first guard settings are protected; a nested copy is not', () => {
  assert.equal(findProtected(['dope-tdd.json']).protected, true);
  assert.equal(findProtected(['apps/web/dope-tdd.json']).protected, false);
});

// .npmrc can change what every npm command does (registry, node-options);
// .mcp.json adds tool servers to agent sessions in this repository.
test('the npm and MCP settings are protected; nested copies are not the root ones', () => {
  assert.deepEqual(findProtected(['.npmrc', '.mcp.json']).matches, ['.npmrc', '.mcp.json']);
  assert.equal(findProtected(['apps/web/.npmrc', 'docs/.mcp.json.md']).protected, false);
});

// The night shift's diff check reuses these, so they stay exported.
test('normalise and matches are shared with the night-shift diff check', () => {
  assert.equal(normalise('.\\.github\\x.yml '), '.github/x.yml');
  assert.equal(matches('.github/x.yml', { path: '.github/' }), true);
  assert.equal(matches('CLAUDE.md.bak', { path: 'CLAUDE.md' }), false);
});
