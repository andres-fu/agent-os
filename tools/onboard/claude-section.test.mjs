import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySection } from './claude-section.mjs';
import { SECTION_MARKERS } from './intake.mjs';

const { start, end } = SECTION_MARKERS;
const BODY = 'A school app for tracking reading.\nStart with the first slice.';

test('a CRLF CLAUDE.md is byte-identical outside the markers', () => {
  const before = '﻿# Rules\r\n\r\nKeep this.\r\n';
  const after = '\r\n## Other\r\nTail without newline';
  const old = `${start}\r\nold text\r\n${end}`;
  const r = applySection(before + old + after, BODY);
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  const i = r.value.indexOf(start);
  const j = r.value.indexOf(end) + end.length;
  assert.equal(r.value.slice(0, i), before);
  assert.equal(r.value.slice(j), after);
  assert.ok(r.value.slice(i, j).includes('A school app for tracking reading.\r\nStart'));
  assert.ok(!/[^\r]\n/.test(r.value.slice(i, j)), 'inserted text uses CRLF');
});

test('append keeps the original bytes as a prefix, with BOM and CRLF', () => {
  const orig = '﻿# Rules\r\nKeep.\r\n';
  const r = applySection(orig, BODY);
  assert.equal(r.ok, true);
  assert.ok(r.value.startsWith(orig));
  assert.ok(r.value.includes(start) && r.value.includes(end));
  assert.ok(!/[^\r]\n/.test(r.value));
});

test('append to LF text and to empty text', () => {
  const r = applySection('# Rules\nKeep.', BODY);
  assert.equal(r.ok, true);
  assert.ok(r.value.startsWith('# Rules\nKeep.'));
  assert.ok(!r.value.includes('\r'));
  assert.equal(applySection('', BODY).ok, true);
});

test('applying the same body twice changes nothing', () => {
  const first = applySection('# Rules\n', BODY);
  const again = applySection(first.value, BODY);
  assert.deepEqual(again, { ok: true, value: first.value, changed: false });
  const crlf = applySection('# Rules\r\n', BODY);
  assert.equal(applySection(crlf.value, BODY).changed, false);
});

test('replace changes only the section', () => {
  const first = applySection('# A\n', BODY).value;
  const r = applySection(first, 'New words.');
  assert.equal(r.changed, true);
  assert.ok(r.value.includes('New words.') && !r.value.includes('reading'));
  assert.ok(r.value.startsWith('# A\n'));
});

test('100 words pass, 101 fail, a hyphenated word counts once', () => {
  assert.equal(applySection('', Array(100).fill('w').join(' ')).ok, true);
  assert.equal(applySection('', Array(101).fill('w').join(' ')).ok, false);
  const hyph = `special-education ${Array(99).fill('w').join(' ')}`;
  assert.equal(applySection('', hyph).ok, true);
});

test('bad markers and bad bodies are errors that never echo the file', () => {
  const secret = 'SECRET-TEXT';
  const cases = [
    `${secret}\n${start}\n`,
    `${secret}\n${end}\n`,
    `${secret}\n${end}\n${start}\n`,
    `${start}\n${end}\n${start}\n${end}\n`,
    `${start}\n${start}\n${end}\n`,
  ];
  for (const text of cases) {
    const r = applySection(text, BODY);
    assert.equal(r.ok, false);
    assert.ok(!r.error.includes(secret));
  }
  for (const body of ['', '   ', null, 42, `x ${start} y`, 'a <!-- onboard:Q1 part=Data -->']) {
    assert.equal(applySection('# A\n', body).ok, false);
  }
  assert.equal(applySection(null, BODY).ok, false);
  const r = applySection('# A\n', `${secret} ${start}`);
  assert.ok(!r.error.includes(secret));
});
