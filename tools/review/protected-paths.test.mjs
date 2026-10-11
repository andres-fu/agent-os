import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findProtected, PROTECTED } from './protected-paths.mjs';

test('a PR that only changes code and specs is not protected', () => {
  const result = findProtected(['src/app.ts', 'tests/app.test.ts', 'docs/specs/2026-10-12-x.md']);
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
