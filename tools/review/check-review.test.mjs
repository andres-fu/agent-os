// The /review skill's checker: a reviewer's draft has exactly one verdict in
// its role's words, labels its evidence, ends with the hand-off note and stays
// within the word limit. Reviewers can't write files, so it reads standard input.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkReview } from './check-review.mjs';

const principal = (verdict = '**Verdict: Approve**', extra = '') =>
  [
    '**Correct:** *observed* (`a.mjs:3`): the test fails without the change.',
    '- **Advice:** rename `x`.',
    extra,
    verdict,
    '',
    'Hand-off',
    '- Done: reviewed 1a2b3c4',
    '- Next: the stakeholder merges',
  ].join('\n');

test('a principal review with one verdict, labels and a hand-off passes', () => {
  assert.deepEqual(checkReview(principal(), { role: 'principal' }), []);
});

test('each principal verdict word is accepted', () => {
  for (const verdict of ['**Approve**', '**Request changes**', '**Escalate**', '**Verdict: Request changes**']) {
    assert.deepEqual(checkReview(principal(verdict), { role: 'principal' }), [], verdict);
  }
});

test('no verdict, or two, is a problem', () => {
  assert.ok(checkReview(principal('No verdict here.'), { role: 'principal' }).some((p) => /exactly one verdict/.test(p)));
  const two = checkReview(principal('**Approve**', '**Escalate**'), { role: 'principal' });
  assert.ok(two.some((p) => /exactly one verdict/.test(p)), two.join('\n'));
});

test('the security reviewer uses its own verdict words', () => {
  for (const verdict of ['**Pass**', '**Pass with advice**', '**Block**']) {
    assert.deepEqual(checkReview(principal(verdict), { role: 'security' }), [], verdict);
  }
  assert.ok(checkReview(principal('**Approve**'), { role: 'security' }).some((p) => /exactly one verdict/.test(p)));
});

test('a review with no observed evidence is a problem', () => {
  const text = principal().replace('*observed*', '*inferred*');
  assert.ok(checkReview(text, { role: 'principal' }).some((p) => /observed/.test(p)));
});

test('a review without the hand-off note is a problem', () => {
  const text = principal().replace('Hand-off', 'Next steps');
  assert.ok(checkReview(text, { role: 'principal' }).some((p) => /Hand-off/.test(p)));
});

test('the word limit is 400 for the principal engineer and 350 for security', () => {
  // The fixture itself is about 30 words.
  const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
  assert.deepEqual(checkReview(principal('**Approve**', words(350)), { role: 'principal' }), []);
  assert.ok(checkReview(principal('**Approve**', words(400)), { role: 'principal' }).some((p) => /400 words/.test(p)));
  assert.deepEqual(checkReview(principal('**Pass**', words(300)), { role: 'security' }), []);
  assert.ok(checkReview(principal('**Pass**', words(340)), { role: 'security' }).some((p) => /350 words/.test(p)));
});

test('an unknown role is an error, not a silent pass', () => {
  assert.throws(() => checkReview(principal(), { role: 'ux' }), /role/);
});

const script = fileURLToPath(new URL('./check-review.mjs', import.meta.url));

test('the command line reads the draft on standard input', () => {
  const ok = spawnSync(process.execPath, [script, '--role', 'principal'], { input: principal(), encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(ok.stdout, 'ok: review\n');
  const bad = spawnSync(process.execPath, [script, '--role', 'security'], { input: principal('**Approve**'), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /exactly one verdict/);
});

test('the command line needs --role', () => {
  assert.equal(spawnSync(process.execPath, [script], { input: principal(), encoding: 'utf8' }).status, 2);
});
