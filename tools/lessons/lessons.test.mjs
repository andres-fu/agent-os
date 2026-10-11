import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseFrontmatter,
  validateLesson,
  checkLessons,
  renderIndex,
} from './lessons.mjs';

const VALID = `---
id: L-0001
title: Exit codes lie when output is piped
date: 2026-10-08
project: dope-tdd
kind: mistake
status: adopted
rule: Judge a test run by the runner's summary line, never by the exit code.
enforced_by: gate
evidence:
  - https://github.com/andres-fu/dope-tdd/blob/main/DOGFOOD.md
  - commit:4a5cdc5
---

## What happened
An agent piped vitest through tail and the failing run was logged as a pass.
`;

function fieldsOf(text) {
  const parsed = parseFrontmatter(text);
  assert.equal(parsed.ok, true, parsed.error);
  return parsed.value.fields;
}

// --- parseFrontmatter ---------------------------------------------------

test('parses scalars and a string list, and keeps the body', () => {
  const parsed = parseFrontmatter(VALID);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.fields.id, 'L-0001');
  assert.deepEqual(parsed.value.fields.evidence, [
    'https://github.com/andres-fu/dope-tdd/blob/main/DOGFOOD.md',
    'commit:4a5cdc5',
  ]);
  assert.match(parsed.value.body, /## What happened/);
});

test('strips matching quotes around a scalar', () => {
  const fields = fieldsOf('---\ntitle: "Colons: are fine when quoted"\n---\n');
  assert.equal(fields.title, 'Colons: are fine when quoted');
});

test('reads CRLF files the same as LF files', () => {
  const fields = fieldsOf(VALID.replace(/\n/g, '\r\n'));
  assert.equal(fields.id, 'L-0001');
  assert.equal(fields.evidence.length, 2);
});

test('fails without an opening frontmatter fence', () => {
  const parsed = parseFrontmatter('id: L-0001\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /must start with ---/);
});

test('fails without a closing fence', () => {
  const parsed = parseFrontmatter('---\nid: L-0001\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /closing ---/);
});

test('names the line of a malformed entry', () => {
  const parsed = parseFrontmatter('---\nid: L-0001\nthis is not a field\n---\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /line 3/);
});

test('rejects a list item with no key above it', () => {
  const parsed = parseFrontmatter('---\n  - orphan\n---\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /line 2/);
});

test('rejects a duplicated key', () => {
  const parsed = parseFrontmatter('---\nid: L-0001\nid: L-0002\n---\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /duplicate key "id"/);
});

// --- validateLesson -----------------------------------------------------

test('a complete lesson has no errors', () => {
  assert.deepEqual(validateLesson(fieldsOf(VALID), 'L-0001-exit-codes.md'), []);
});

test('every required field is named when missing', () => {
  const errors = validateLesson({}, 'L-0001-x.md');
  for (const key of ['id', 'title', 'date', 'project', 'kind', 'status', 'rule', 'evidence']) {
    assert.ok(errors.some((e) => e.includes(`"${key}"`)), `missing ${key}: ${errors}`);
  }
});

test('a lesson with no evidence is rejected', () => {
  const fields = { ...fieldsOf(VALID), evidence: [] };
  const errors = validateLesson(fields, 'L-0001-x.md');
  assert.ok(errors.some((e) => /at least one evidence/.test(e)), errors.join('\n'));
});

test('evidence must be a link or a commit, not a claim', () => {
  const fields = { ...fieldsOf(VALID), evidence: ['trust me, it happened'] };
  const errors = validateLesson(fields, 'L-0001-x.md');
  assert.ok(errors.some((e) => /trust me/.test(e)), errors.join('\n'));
});

test('plain http evidence is rejected', () => {
  const fields = { ...fieldsOf(VALID), evidence: ['http://example.com/run/1'] };
  assert.equal(validateLesson(fields, 'L-0001-x.md').length, 1);
});

test('a single evidence scalar is treated as a list of one', () => {
  const fields = { ...fieldsOf(VALID), evidence: 'commit:abcdef1' };
  assert.deepEqual(validateLesson(fields, 'L-0001-x.md'), []);
});

test('rejects a malformed id, an impossible date and unknown enums', () => {
  const fields = {
    ...fieldsOf(VALID),
    id: 'lesson-1',
    date: '2026-02-30',
    kind: 'vibe',
    status: 'maybe',
    enforced_by: 'hope',
  };
  const errors = validateLesson(fields, 'lesson-1.md');
  assert.ok(errors.some((e) => e.includes('"id"')));
  assert.ok(errors.some((e) => e.includes('"date"')));
  assert.ok(errors.some((e) => e.includes('"kind"')));
  assert.ok(errors.some((e) => e.includes('"status"')));
  assert.ok(errors.some((e) => e.includes('"enforced_by"')));
});

test('the file name must start with the id', () => {
  const errors = validateLesson(fieldsOf(VALID), 'L-0002-other.md');
  assert.ok(errors.some((e) => /file name/.test(e)), errors.join('\n'));
});

test('an adopted lesson must say what enforces it', () => {
  const fields = { ...fieldsOf(VALID), enforced_by: 'none' };
  const errors = validateLesson(fields, 'L-0001-x.md');
  assert.ok(errors.some((e) => /adopted/.test(e)), errors.join('\n'));
});

test('a proposed lesson may have no enforcement yet', () => {
  const fields = { ...fieldsOf(VALID), status: 'proposed', enforced_by: undefined };
  assert.deepEqual(validateLesson(fields, 'L-0001-x.md'), []);
});

// --- checkLessons -------------------------------------------------------

function lessonDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'lessons-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test('checks every lesson file and skips README and templates', () => {
  const dir = lessonDir({
    'L-0001-exit-codes.md': VALID,
    'README.md': '# not a lesson',
    '_template.md': '---\nid: L-XXXX\n---\n',
  });
  const result = checkLessons([dir]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessons[0].fields.id, 'L-0001');
});

test('reports each bad file with its path', () => {
  const dir = lessonDir({
    'L-0001-exit-codes.md': VALID,
    'L-0002-broken.md': 'no frontmatter here',
  });
  const result = checkLessons([dir]);
  assert.equal(result.lessons.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /L-0002-broken\.md/);
});

test('the same id twice in one project is an error', () => {
  const dir = lessonDir({
    'L-0001-exit-codes.md': VALID,
    'L-0001-again.md': VALID,
  });
  const result = checkLessons([dir]);
  assert.ok(result.errors.some((e) => /duplicate id L-0001/.test(e)), result.errors.join('\n'));
});

test('the same id in two projects is fine: ids are per project', () => {
  const a = lessonDir({ 'L-0001-exit-codes.md': VALID });
  const b = lessonDir({ 'L-0001-exit-codes.md': VALID.replace('project: dope-tdd', 'project: orca') });
  const result = checkLessons([a, b]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.lessons.length, 2);
});

test('a missing directory is an error, not an empty pass', () => {
  const result = checkLessons([join(tmpdir(), 'no-such-lessons-dir-xyz')]);
  assert.equal(result.lessons.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot read/);
});

test('nested folders are not read: one flat folder per project', () => {
  const dir = lessonDir({ 'L-0001-exit-codes.md': VALID });
  mkdirSync(join(dir, 'archive'));
  writeFileSync(join(dir, 'archive', 'L-0009-old.md'), 'garbage');
  assert.deepEqual(checkLessons([dir]).errors, []);
});

// --- renderIndex --------------------------------------------------------

test('the index groups adopted lessons first and links each file', () => {
  const dir = lessonDir({
    'L-0001-exit-codes.md': VALID,
    'L-0002-later.md': VALID.replace('L-0001', 'L-0002')
      .replace('status: adopted', 'status: proposed')
      .replace('title: Exit codes lie when output is piped', 'title: A newer idea'),
  });
  const { lessons } = checkLessons([dir]);
  const md = renderIndex(lessons, { relativeTo: dir });
  assert.ok(md.indexOf('## Adopted') < md.indexOf('## Proposed'));
  assert.match(md, /\[L-0001\]\(L-0001-exit-codes\.md\)/);
  assert.match(md, /Judge a test run by the runner's summary line/);
  assert.match(md, /dope-tdd/);
});

test('pipes in a title cannot break the table', () => {
  const dir = lessonDir({
    'L-0001-exit-codes.md': VALID.replace('title: Exit codes lie when output is piped', 'title: a | b'),
  });
  const md = renderIndex(checkLessons([dir]).lessons, { relativeTo: dir });
  assert.match(md, /a \\\| b/);
});

test('an empty ledger says so', () => {
  assert.match(renderIndex([], { relativeTo: '.' }), /No lessons yet/);
});
