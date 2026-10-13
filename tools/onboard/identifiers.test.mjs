import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIdentifiers } from './identifiers.mjs';

const kinds = (text) => findIdentifiers(text).map((r) => r.kind);

test('reports an email', () => {
  assert.deepEqual(kinds('Write to jane.doe+x@example.com today'), ['email']);
});

test('reports phone numbers in common shapes', () => {
  for (const p of ['555-010-0100', '(555) 010-0100', '+1 555 010 0100', '555.010.0100', '+44 20 7946 0100']) {
    assert.deepEqual(kinds(`call ${p} now`), ['phone'], p);
  }
});

test('reports runs of 8 or more digits as id-number, including compact dates', () => {
  assert.deepEqual(kinds('student 12345678'), ['id-number']);
  assert.deepEqual(kinds('stamp 20261011'), ['id-number']);
  assert.deepEqual(kinds('long 5550100123'), ['id-number']);
});

test('does not report 7 digits', () => {
  assert.deepEqual(kinds('room 1234567'), []);
});

test('reports the 123-45-6789 pattern', () => {
  assert.deepEqual(kinds('ssn 123-45-6789'), ['id-number']);
});

test('reports full dates', () => {
  assert.deepEqual(kinds('on 2026-10-11'), ['date']);
  assert.deepEqual(kinds('on 10/11/2026'), ['date']);
  assert.deepEqual(kinds('on 1/2/2026'), ['date']);
  assert.deepEqual(kinds('on October 11, 2026'), ['date']);
  assert.deepEqual(kinds('on Oct 11 2026'), ['date']);
  assert.deepEqual(kinds('on March 3rd, 2026'), ['date']);
});

test('ignores partial dates, versions and plain prose', () => {
  assert.deepEqual(kinds('in October 2026, version 1.2.3, 10/11, 2026'), []);
  assert.deepEqual(kinds('a class of 25 pupils, 3 teachers'), []);
  assert.deepEqual(kinds(''), []);
});

test('reports several kinds in one text, one entry per match', () => {
  assert.deepEqual(kinds('a@example.com b@example.com 555-010-0100 2026-10-11').sort(),
    ['date', 'email', 'email', 'phone']);
});

test('results never contain the matched text', () => {
  const text = 'a@example.com 555-010-0100 123-45-6789 20261011 2026-10-11 October 11, 2026';
  const results = findIdentifiers(text);
  assert.ok(results.length >= 6);
  for (const r of results) assert.deepEqual(Object.keys(r), ['kind']);
  const json = JSON.stringify(results);
  for (const frag of ['example', '555', '6789', '2026', '1011', 'October']) {
    assert.ok(!json.includes(frag), frag);
  }
});

test('rejects non-string input with a TypeError', () => {
  assert.throws(() => findIdentifiers(undefined), TypeError);
});

test('long hostile input finishes quickly', () => {
  const inputs = [
    'a'.repeat(200000),
    'a.'.repeat(100000),
    'a@' + 'b.'.repeat(100000),
    '1 '.repeat(100000),
    '(' .repeat(100000),
    '1-'.repeat(100000),
  ];
  const start = Date.now();
  for (const s of inputs) findIdentifiers(s);
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start}ms`);
});
