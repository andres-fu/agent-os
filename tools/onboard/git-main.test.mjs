import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFromOriginMain } from './git-main.mjs';

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'git-main-'));
  git(root, 'init', '-q');
  return root;
}

function commitFile(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
  git(root, 'add', path);
  git(root, 'commit', '-q', '-m', 'fixture');
}

const setOriginMain = (root) => git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

test('reads the committed text from refs/remotes/origin/main', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/a.md', 'hello\n');
    setOriginMain(root);
    assert.deepEqual(readFromOriginMain(root, 'docs/decisions/a.md'), { found: true, text: 'hello\n' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('never reads the working copy', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/a.md', 'on main\n');
    setOriginMain(root);
    writeFileSync(join(root, 'docs/decisions/a.md'), 'edited locally\n');
    writeFileSync(join(root, 'docs/decisions/b.md'), 'only local\n');
    assert.equal(readFromOriginMain(root, 'docs/decisions/a.md').text, 'on main\n');
    assert.deepEqual(readFromOriginMain(root, 'docs/decisions/b.md'), { found: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file committed locally but not on origin/main is not found', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/a.md', 'first\n');
    setOriginMain(root);
    commitFile(root, 'docs/decisions/c.md', 'later\n');
    assert.deepEqual(readFromOriginMain(root, 'docs/decisions/c.md'), { found: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without refs/remotes/origin/main nothing is found', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/a.md', 'x\n');
    assert.deepEqual(readFromOriginMain(root, 'docs/decisions/a.md'), { found: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a root that is not a repository or does not exist is not found', () => {
  const missing = join(tmpdir(), 'git-main-does-not-exist-xyz');
  assert.deepEqual(readFromOriginMain(missing, 'docs/decisions/a.md'), { found: false });
});

test('paths outside the decision regex are refused before git runs', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/a.md', 'x\n');
    commitFile(root, 'README.md', 'secret\n');
    setOriginMain(root);
    const bad = [
      'README.md',
      '../README.md',
      'docs/decisions/../../README.md',
      'docs/decisions/sub/a.md',
      'docs/decisions/a.txt',
      'docs/decisions/a b.md',
      'docs/decisions/a.md\n',
      'docs/decisions/--help.md;x',
      '/etc/passwd',
      '',
      undefined,
      null,
      42,
      ['docs/decisions/a.md'],
    ];
    for (const path of bad) {
      assert.deepEqual(readFromOriginMain(root, path), { found: false }, String(path));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('output too large for maxBuffer is not found', () => {
  const root = makeRepo();
  try {
    commitFile(root, 'docs/decisions/big.md', 'a'.repeat(300000));
    setOriginMain(root);
    assert.deepEqual(readFromOriginMain(root, 'docs/decisions/big.md'), { found: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
