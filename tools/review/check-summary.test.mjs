import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findEncodedBlobs } from './check-summary.mjs';

test('an ordinary review has no encoded blobs', () => {
  const text = [
    '**Blocking:** `src/app.ts:12` drops the error (*observed*).',
    'See https://github.com/andres-fu/agent-os/actions/runs/38166436198 and commit 1d6de8cb0c237e7c15e9e1bdf973826ebae490cc.',
    'Image sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b is pinned.',
  ].join('\n');
  assert.deepEqual(findEncodedBlobs(text), []);
});

test('a long base64 run is found', () => {
  const blob = Buffer.from('sk-ant-oat01-' + 'x'.repeat(90)).toString('base64');
  const found = findEncodedBlobs(`Verdict approve. ${blob} done`);
  assert.equal(found.length, 1);
  assert.equal(found[0].length, blob.length);
});

test('a long hex or url-safe run is found', () => {
  assert.equal(findEncodedBlobs('a'.repeat(79)).length, 0);
  assert.equal(findEncodedBlobs('ab'.repeat(40)).length, 1);
  assert.equal(findEncodedBlobs('A_b-C'.repeat(20)).length, 1);
});

test('the minimum length can be changed', () => {
  assert.equal(findEncodedBlobs('x'.repeat(30), { minLength: 20 }).length, 1);
});

test('a non-string is an error, not a silent pass', () => {
  assert.throws(() => findEncodedBlobs(undefined), TypeError);
});

test('an invalid minimum length is an error', () => {
  assert.throws(() => findEncodedBlobs('abc', { minLength: 0 }), RangeError);
  assert.throws(() => findEncodedBlobs('abc', { minLength: 2.5 }), RangeError);
});
