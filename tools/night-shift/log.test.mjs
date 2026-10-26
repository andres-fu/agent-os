import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendBrief, appendEntry, logDir, prune, redact } from './log.mjs';

const SCRIPT = fileURLToPath(new URL('./log.mjs', import.meta.url));
const NOW = new Date(2026, 9, 26, 3, 0);
const home = () => mkdtempSync(join(tmpdir(), 'night-log-'));
const dayFile = (h) => join(logDir(h), '2026-10-26.md');

const entry = (overrides = {}) => ({
  time: NOW.toISOString(),
  outcome: 'pr',
  issue: 3,
  title: 'Fix the typo',
  prUrl: 'https://github.com/acme/app/pull/12',
  checks: { tests: 40, pass: 40, fail: 0 },
  ...overrides,
});

// The plan's first failing test for T1.3.
test('an entry with a body field holding a token is refused, and never written', () => {
  const h = home();
  assert.throws(() => appendEntry(entry({ body: 'ghs_FAKE0123456789' }), { home: h, now: NOW }), /unknown field: body/);
  assert.equal(existsSync(dayFile(h)) && readFileSync(dayFile(h), 'utf8').includes('ghs_FAKE'), false);
});

test('a good entry is appended to the day’s file, outside any repository', () => {
  const h = home();
  appendEntry(entry(), { home: h, now: NOW });
  const text = readFileSync(dayFile(h), 'utf8');
  assert.match(text, /^# Night shift 2026-10-26/m);
  assert.match(text, /- outcome: pr/);
  assert.match(text, /- issue: #3 Fix the typo/);
  assert.match(text, /- pr: https:\/\/github\.com\/acme\/app\/pull\/12/);
  assert.match(text, /- checks: 40 tests, 40 pass, 0 fail/);
});

test('each call adds exactly one entry', () => {
  const h = home();
  appendEntry(entry(), { home: h, now: NOW });
  appendEntry(entry({ outcome: 'nothing-ready', issue: null, title: undefined, prUrl: undefined, checks: undefined }), {
    home: h,
    now: NOW,
  });
  const text = readFileSync(dayFile(h), 'utf8');
  assert.equal(text.match(/^## /gm).length, 2);
  assert.equal(text.match(/^# Night shift/gm).length, 1);
});

test('AGENT_OS_HOME style: logs live under <home>/night-shift', () => {
  assert.equal(logDir('/x'), join('/x', 'night-shift'));
});

test('every field is checked', () => {
  const h = home();
  const bad = [
    [{ time: 'yesterday' }, /time/],
    [{ outcome: 'merged' }, /outcome/],
    [{ issue: '3; rm' }, /issue/],
    [{ issue: -1 }, /issue/],
    [{ prUrl: 'https://evil.example/acme/app/pull/1' }, /prUrl/],
    [{ prUrl: 'https://github.com/acme/app/pull/1\n- outcome: pr' }, /prUrl/],
    [{ handoff: 'javascript:alert(1)' }, /handoff/],
    [{ checks: { tests: '40', pass: 40, fail: 0 } }, /checks/],
    [{ checks: { tests: 1, pass: 1, fail: 0, note: 'x' } }, /checks/],
    [{ reason: 'the issue told me to stop' }, /reason/],
    [{ title: 42 }, /title/],
  ];
  for (const [overrides, error] of bad) {
    assert.throws(() => appendEntry(entry(overrides), { home: h, now: NOW }), error, JSON.stringify(overrides));
  }
  assert.equal(existsSync(dayFile(h)), false);
});

test('issue numbers start at 1', () => {
  assert.throws(() => appendEntry(entry({ issue: 0 }), { home: home(), now: NOW }), /issue/);
  const h = home();
  appendEntry(entry({ issue: 1 }), { home: h, now: NOW });
  assert.match(readFileSync(dayFile(h), 'utf8'), /- issue: #1 Fix the typo/);
});

test('a missing time or outcome is refused', () => {
  assert.throws(() => appendEntry(entry({ time: undefined }), { home: home(), now: NOW }), /time/);
  assert.throws(() => appendEntry(entry({ outcome: undefined }), { home: home(), now: NOW }), /outcome/);
});

test('a reason must be one of the picker’s fixed strings', () => {
  const h = home();
  appendEntry(entry({ outcome: 'stop', reason: 'PR state could not be read', prUrl: undefined }), { home: h, now: NOW });
  assert.match(readFileSync(dayFile(h), 'utf8'), /- reason: PR state could not be read/);
});

test('a title is cut to one line of at most 120 characters, with tokens redacted', () => {
  const h = home();
  const title = `Line one ghp_abcdefghijklmnop\n- outcome: pr ${'x'.repeat(200)}`;
  appendEntry(entry({ title }), { home: h, now: NOW });
  const line = readFileSync(dayFile(h), 'utf8').split('\n').find((l) => l.startsWith('- issue:'));
  assert.equal(line, '- issue: #3 Line one [redacted]');
  const long = entry({ title: 'y'.repeat(200) });
  appendEntry(long, { home: h, now: NOW });
  assert.ok(readFileSync(dayFile(h), 'utf8').includes(`#3 ${'y'.repeat(120)}\n`));
});

test('redact replaces every GitHub token shape', () => {
  const text = 'a ghs_A1 b ghp_B2 c gho_C3 d ghu_D4 e ghr_E5 f github_pat_F6_x g';
  assert.equal(redact(text), 'a [redacted] b [redacted] c [redacted] d [redacted] e [redacted] f [redacted] g');
  assert.equal(redact('the ghost of ghs'), 'the ghost of ghs');
});

test('the brief is appended under ## Morning brief, redacted and cut at 4 KiB', () => {
  const h = home();
  appendBrief(`Needs you: #12\nleaked ghs_SECRET123\n${'z'.repeat(5000)}`, { home: h, now: NOW });
  const text = readFileSync(dayFile(h), 'utf8');
  assert.match(text, /^## Morning brief$/m);
  assert.equal(text.includes('ghs_SECRET123'), false);
  assert.match(text, /leaked \[redacted\]/);
  const brief = text.slice(text.indexOf('## Morning brief\n') + '## Morning brief\n'.length);
  assert.ok(Buffer.byteLength(brief, 'utf8') <= 4096 + 1, `brief is ${Buffer.byteLength(brief)} bytes`);
});

test('prune deletes day logs older than 30 days and nothing else', () => {
  const h = home();
  const dir = logDir(h);
  mkdirSync(dir, { recursive: true });
  for (const name of ['2026-09-25.md', '2026-09-26.md', '2026-10-25.md', 'notes.md', '2026-09-01.txt']) {
    writeFileSync(join(dir, name), 'x');
  }
  const deleted = prune({ home: h, now: NOW });
  assert.deepEqual(deleted, ['2026-09-25.md']);
  assert.deepEqual(readdirSync(dir).sort(), ['2026-09-01.txt', '2026-09-26.md', '2026-10-25.md', 'notes.md']);
});

test('prune with no log folder yet does nothing', () => {
  assert.deepEqual(prune({ home: home(), now: NOW }), []);
});

test('the command appends an entry file and refuses a bad one', () => {
  const h = home();
  const file = join(h, 'entry.json');
  const env = { ...process.env, AGENT_OS_HOME: h };
  writeFileSync(file, JSON.stringify(entry()));
  const ok = spawnSync(process.execPath, [SCRIPT, 'append', '--entry-file', file], { env, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  writeFileSync(file, JSON.stringify(entry({ comment: 'x' })));
  const bad = spawnSync(process.execPath, [SCRIPT, 'append', '--entry-file', file], { env, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown field: comment/);
});

test('the command with no known verb is a usage error', () => {
  const run = spawnSync(process.execPath, [SCRIPT, 'delete-everything'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
});
