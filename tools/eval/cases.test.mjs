// Tests for the eval case format (tools/eval/cases.mjs): the frontmatter
// and sections a golden case must have, the check lines a scorer can run,
// and the ten committed cases themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALWAYS, CHECK_KINDS, loadCases, parseCase } from './cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const VALID = `---
id: C9
kind: chain
name: Example case
chain: developer, CI review
start: 4c511ed
reference: https://github.com/andres-fu/agent-os/pull/57
---
## Input
Build the diff check.

## Must pass
- check: files-only tools/night-shift/diff-check.mjs,tools/night-shift/diff-check.test.mjs
- check: transcript-has PROVEN
- rubric: red was seen for the right reason
`;

test('a valid case parses into fields, input, checks and rubric', () => {
  const result = parseCase(VALID);
  assert.equal(result.ok, true, result.errors?.join('\n'));
  const c = result.value;
  assert.equal(c.id, 'C9');
  assert.equal(c.kind, 'chain');
  assert.equal(c.name, 'Example case');
  assert.equal(c.start, '4c511ed');
  assert.equal(c.input, 'Build the diff check.');
  assert.deepEqual(c.checks, [
    { kind: 'files-only', args: ['tools/night-shift/diff-check.mjs,tools/night-shift/diff-check.test.mjs'], text: 'files-only tools/night-shift/diff-check.mjs,tools/night-shift/diff-check.test.mjs' },
    { kind: 'transcript-has', args: ['PROVEN'], text: 'transcript-has PROVEN' },
  ]);
  assert.deepEqual(c.rubric, ['red was seen for the right reason']);
});

test('a check keeps everything after its kind as one argument string, spaces included', () => {
  const text = VALID.replace('- check: transcript-has PROVEN', '- check: receipt-has Fixes #60 in the body');
  const c = parseCase(text).value;
  assert.deepEqual(c.checks[1], { kind: 'receipt-has', args: ['Fixes #60 in the body'], text: 'receipt-has Fixes #60 in the body' });
});

test('missing frontmatter is an error', () => {
  const result = parseCase('## Input\nx\n## Must pass\n- check: transcript-has x\n');
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /frontmatter/);
});

test('each required field is named when missing', () => {
  const text = VALID.replace('reference: https://github.com/andres-fu/agent-os/pull/57\n', '');
  const result = parseCase(text);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /reference/.test(e)), result.errors.join('\n'));
});

test('kind must be chain or rule', () => {
  const result = parseCase(VALID.replace('kind: chain', 'kind: probe'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /kind/.test(e) && /chain/.test(e) && /rule/.test(e)));
});

test('id must be C or R followed by a number', () => {
  const result = parseCase(VALID.replace('id: C9', 'id: case-9'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /\bid\b/.test(e)));
});

test('start must be a commit, 7 to 40 hex characters', () => {
  const result = parseCase(VALID.replace('start: 4c511ed', 'start: main before PR 8'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /start/.test(e) && /commit/.test(e)));
});

test('an unknown check kind is an error that names it', () => {
  const result = parseCase(VALID.replace('transcript-has PROVEN', 'vibes-ok yes'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /vibes-ok/.test(e)));
});

test('a check kind without its argument is an error', () => {
  const result = parseCase(VALID.replace('transcript-has PROVEN', 'transcript-has'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /transcript-has/.test(e) && /argument/.test(e)));
});

test('an empty Input section is an error', () => {
  const result = parseCase(VALID.replace('Build the diff check.\n', ''));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Input/.test(e)));
});

test('a case needs at least one check or rubric line', () => {
  const text = VALID.replace(/- check:.*\n|- rubric:.*\n/g, '');
  const result = parseCase(text);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Must pass/.test(e)));
});

test('a Must pass line that is neither check nor rubric is an error', () => {
  const result = parseCase(VALID.replace('- rubric: red was seen for the right reason', '- red was seen'));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /check: or rubric:/.test(e)));
});

test('CRLF files parse the same as LF', () => {
  const result = parseCase(VALID.replace(/\n/g, '\r\n'));
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.value.input, 'Build the diff check.');
});

test('every ALWAYS check uses a known kind, and the loop cap is a rubric item', () => {
  for (const check of ALWAYS.checks) assert.ok(CHECK_KINDS.includes(check.kind), check.kind);
  assert.ok(ALWAYS.rubric.some((r) => /three/.test(r) && /BLOCKED/.test(r)));
});

test('the ALWAYS label check accepts "observed" and "Observed", not "unobserved"', () => {
  const label = ALWAYS.checks.find((c) => c.kind === 'transcript-has' && /bserved/.test(c.args[0]));
  assert.ok(label, 'an observed-label check exists');
  const re = new RegExp(label.args[0], 'm');
  assert.ok(re.test('Fact, *observed* in file:line'));
  assert.ok(re.test('Observed: the run printed ok'));
  assert.ok(!re.test('it went unobserved'));
});

test('the committed cases load: ten of them, six chains and four rules, unique ids', () => {
  const { cases, errors } = loadCases(join(here, 'cases'));
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 10);
  assert.equal(cases.filter((c) => c.kind === 'chain').length, 6);
  assert.equal(cases.filter((c) => c.kind === 'rule').length, 4);
  assert.equal(new Set(cases.map((c) => c.id)).size, 10);
  for (const c of cases) assert.ok(c.checks.length + c.rubric.length > 0, c.id);
});

test('loadCases reports a bad file by name without dropping the good ones', () => {
  const { cases, errors } = loadCases(join(here, 'cases'), {
    extra: { 'bad.md': 'no frontmatter here' },
  });
  assert.equal(cases.length, 10);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bad\.md/);
});
