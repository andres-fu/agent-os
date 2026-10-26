import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkDiff, FORBIDDEN } from './diff-check.mjs';

const SCRIPT = fileURLToPath(new URL('./diff-check.mjs', import.meta.url));

// The input is what `git diff --name-only --no-renames -z` prints: names
// separated, and ended, by NUL.
const z = (...files) => files.map((file) => `${file}\0`).join('');

test('the picker and the manifest are forbidden; ordinary tools code is not', () => {
  const result = checkDiff(z('tools/night-shift/pick.mjs', 'package.json', 'tools/onboard/intake.mjs'));
  assert.deepEqual(result, { ok: false, forbidden: ['tools/night-shift/pick.mjs', 'package.json'] });
});

test('a change that touches only allowed files is ok', () => {
  assert.deepEqual(checkDiff(z('tools/onboard/intake.mjs', 'tools/onboard/intake.test.mjs', 'docs/notes.md')), {
    ok: true,
    forbidden: [],
  });
});

test('every path the spec lists is forbidden', () => {
  const files = [
    'CLAUDE.md',
    'AGENTS.md',
    '.claude/settings.json',
    '.github/workflows/gates.yml',
    'docs/decisions/2026-10-11-merge-authority.md',
    'docs/lessons/L-0019-x.md',
    'docs/specs/2026-10-21-night-shift.md',
    'tools/night-shift/night-shift.md',
    'tools/review/protected-paths.mjs',
    'tools/guard/branch-guard.mjs',
    'dope-tdd.json',
  ];
  assert.deepEqual(checkDiff(z(...files)).forbidden, files);
});

// --no-renames lists both sides of a move, so a file moved out of a
// forbidden folder is still caught by its old name.
test('moving a file out of .github is caught by its old path', () => {
  assert.deepEqual(checkDiff(z('.github/workflows/gates.yml', 'scripts/gates.yml')), {
    ok: false,
    forbidden: ['.github/workflows/gates.yml'],
  });
});

test('dependency files are forbidden by base name at any depth', () => {
  const files = [
    'sub/package.json',
    'apps/web/package-lock.json',
    'npm-shrinkwrap.json',
    'a/b/yarn.lock',
    'pnpm-lock.yaml',
  ];
  assert.deepEqual(checkDiff(z(...files)).forbidden, files);
});

test('names that only contain a dependency file name are allowed', () => {
  assert.deepEqual(checkDiff(z('docs/package.json.md', 'src/my-package.json')).forbidden, []);
});

test('scanner settings are forbidden by prefix: .gitleaks* and .semgrep*', () => {
  const files = ['.gitleaks.toml', '.gitleaksignore', '.gitleaks/extra.toml', '.semgrep.yml', '.semgrep/rules.yml', '.semgrepignore'];
  assert.deepEqual(checkDiff(z(...files)).forbidden, files);
});

test('the scanner prefixes match at the repository root only', () => {
  assert.deepEqual(checkDiff(z('docs/.gitleaks-notes.md', 'src/semgrep.yml')).forbidden, []);
});

// A case-insensitive checkout (Windows, macOS) writes .GitHub/ into .github/.
test('paths are compared ignoring case', () => {
  const files = ['.GitHub/workflows/x.yml', 'Claude.md', 'Tools/Night-Shift/pick.mjs', 'sub/Package.JSON'];
  assert.deepEqual(checkDiff(z(...files)).forbidden, files);
});

test('Windows separators and a leading ./ are normalised', () => {
  assert.deepEqual(checkDiff(z('.\\.github\\x.yml', './CLAUDE.md')).forbidden, ['.github/x.yml', 'CLAUDE.md']);
});

test('an empty diff fails closed: an empty change is never pushed', () => {
  assert.deepEqual(checkDiff(''), { ok: false, forbidden: [], reason: 'no changed files listed' });
  assert.deepEqual(checkDiff('\0\0'), { ok: false, forbidden: [], reason: 'no changed files listed' });
});

test('a file name with a newline stays one name', () => {
  assert.deepEqual(checkDiff(z('docs/odd\nCLAUDE.md')), { ok: true, forbidden: [] });
});

test('every forbidden rule says why', () => {
  for (const rule of FORBIDDEN) {
    assert.ok(typeof rule.reason === 'string' && rule.reason.length > 0, `${rule.path} has no reason`);
  }
});

test('the command exits 1 and prints the forbidden paths', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { input: z('package.json', 'src/a.mjs'), encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.deepEqual(JSON.parse(run.stdout), { ok: false, forbidden: ['package.json'] });
});

test('the command exits 0 for an allowed change', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { input: z('src/a.mjs'), encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.deepEqual(JSON.parse(run.stdout), { ok: true, forbidden: [] });
});

test('the command exits 1 on empty input', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { input: '', encoding: 'utf8' });
  assert.equal(run.status, 1);
});
