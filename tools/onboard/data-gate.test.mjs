import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLY_SENSITIVE_CATEGORIES, dataGate } from './data-gate.mjs';

const Q6_IDS = [
  'names', 'birthdates', 'id-numbers', 'diagnoses', 'test-scores', 'disability-or-special-education',
  'children', 'health', 'mental-health', 'family', 'school', 'payment', 'none', 'dont-know',
];
const DECISION = 'docs/decisions/2026-10-12-data.md';

function intake({ state = 'answered', data = [], decision = '' } = {}) {
  return { questions: [{ id: 'Q6', part: 'Data', heading: 'x', state, answer: '', madeUp: false, data, decision }], setup: null, flags: null };
}

const decisionText = ({ status = 'decided', outcome = 'build', covers = '' } = {}) =>
  `---\ntitle: Data\nstatus: ${status}\nonboard_outcome: ${outcome}\nonboard_covers: ${covers}\n---\nBody\n`;

const mainWith = (text) => (path) => (path === DECISION && text !== undefined ? { found: true, text } : { found: false });
const noMain = () => ({ found: false });

test('every highly sensitive category maps to Q6 options that exist', () => {
  assert.equal(HIGHLY_SENSITIVE_CATEGORIES.length, 6);
  for (const { category, options } of HIGHLY_SENSITIVE_CATEGORIES) {
    assert.ok(category && options.length > 0, category);
    for (const option of options) assert.ok(Q6_IDS.includes(option), `${category}: ${option}`);
  }
});

test('Q6 open or missing blocks with the fixed reason', () => {
  assert.deepEqual(dataGate(intake({ state: 'open' }), { readMain: noMain }), {
    blocked: true, decision: null, reason: 'Q6 is not answered',
  });
  assert.deepEqual(dataGate({ questions: [] }, { readMain: noMain }), {
    blocked: true, decision: null, reason: 'Q6 is not answered',
  });
  assert.equal(dataGate(null, { readMain: noMain }).blocked, true);
});

test('each category: only its option ticked blocks without a decision', () => {
  for (const { category, options } of HIGHLY_SENSITIVE_CATEGORIES) {
    for (const option of options) {
      const result = dataGate(intake({ data: [option] }), { readMain: noMain });
      assert.equal(result.blocked, true, `${category}/${option}`);
      assert.equal(result.reason, 'no decision recorded: run /escalate');
      assert.equal(result.decision, null);
    }
  }
});

test('non-sensitive options alone do not block', () => {
  for (const id of ['names', 'birthdates', 'family', 'school', 'none']) {
    assert.deepEqual(dataGate(intake({ data: [id] }), { readMain: noMain }), { blocked: false }, id);
  }
  assert.deepEqual(dataGate(intake({ data: ['names', 'school', 'family'] }), { readMain: noMain }), { blocked: false });
});

test('dont-know blocks like a sensitive answer', () => {
  const result = dataGate(intake({ state: 'dont-know' }), { readMain: noMain });
  assert.deepEqual(result, { blocked: true, decision: null, reason: 'no decision recorded: run /escalate' });
});

test('decision on the working copy only: blocked with the fetch reason', () => {
  const result = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: noMain });
  assert.deepEqual(result, { blocked: true, decision: DECISION, reason: 'not on origin/main: run git fetch origin' });
});

test('decision not decided yet stays blocked', () => {
  for (const status of ['proposed', '', 'decided-maybe']) {
    const readMain = mainWith(decisionText({ status, covers: 'health' }));
    const result = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain });
    assert.deepEqual(result, { blocked: true, decision: DECISION, reason: 'not decided yet' }, status);
  }
});

test('blank or unknown outcome is not decided yet; do-not-build keeps the block', () => {
  const blank = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: mainWith(decisionText({ outcome: '', covers: 'health' })) });
  assert.equal(blank.reason, 'not decided yet');
  const no = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: mainWith(decisionText({ outcome: 'do-not-build', covers: 'health' })) });
  assert.deepEqual(no, { blocked: true, decision: DECISION, reason: 'decision is not to build' });
});

test('a decided build decision covering exactly the ticked ids unblocks', () => {
  const readMain = mainWith(decisionText({ covers: 'mental-health health' }));
  const result = dataGate(intake({ data: ['health', 'mental-health'], decision: DECISION }), { readMain });
  assert.deepEqual(result, { blocked: false });
});

test('first token of each value counts, and comma lists work', () => {
  const readMain = mainWith(decisionText({ status: 'decided # ok', outcome: 'build # yes', covers: 'health, payment' }));
  assert.deepEqual(dataGate(intake({ data: ['payment', 'health'], decision: DECISION }), { readMain }), { blocked: false });
});

test('CRLF and BOM in the decision are tolerated', () => {
  const text = '﻿' + decisionText({ covers: 'health' }).replace(/\n/g, '\r\n');
  assert.deepEqual(dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: mainWith(text) }), { blocked: false });
});

test('changing Q6 after the decision re-blocks (binding)', () => {
  const readMain = mainWith(decisionText({ covers: 'health' }));
  for (const data of [['health', 'payment'], ['payment'], ['health', 'children'], []]) {
    const result = dataGate(intake({ data: data.length ? data : ['health'], decision: DECISION }), { readMain });
    if (data.length === 0) continue;
    assert.deepEqual(result, { blocked: true, decision: DECISION, reason: 'decision covers different Q6 answers' }, data.join());
  }
  const blankCovers = mainWith(decisionText({ covers: '' }));
  assert.equal(dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: blankCovers }).reason, 'decision covers different Q6 answers');
});

test('dont-know with a build decision covering the same ticked ids unblocks', () => {
  const readMain = mainWith(decisionText({ covers: 'dont-know' }));
  const result = dataGate(intake({ state: 'dont-know', data: ['dont-know'], decision: DECISION }), { readMain });
  assert.deepEqual(result, { blocked: false });
});

test('a decision path that fails the regex is invalid and never read or echoed', () => {
  let called = false;
  const readMain = () => { called = true; return { found: false }; };
  const evil = '::error::pwned/../x.md';
  const result = dataGate(intake({ data: ['health'], decision: evil }), { readMain });
  assert.equal(result.blocked, true);
  assert.equal(result.decision, null);
  assert.equal(result.reason, 'decision path is not valid');
  assert.equal(called, false);
  assert.ok(!JSON.stringify(result).includes('::'));
});

test('a throwing or malformed readMain fails closed', () => {
  const throws = () => { throw new Error('::boom'); };
  const r1 = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: throws });
  assert.deepEqual(r1, { blocked: true, decision: DECISION, reason: 'not on origin/main: run git fetch origin' });
  const r2 = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: () => ({ found: true }) });
  assert.equal(r2.blocked, true);
});

test('unparseable decision frontmatter never echoes file text', () => {
  const readMain = mainWith('---\n::error::injected line\n---\n');
  const result = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain });
  assert.deepEqual(result, { blocked: true, decision: DECISION, reason: 'not decided yet' });
  assert.ok(!JSON.stringify(result).includes('injected'));
});

test('values starting with :: from the decision are never printed', () => {
  const text = decisionText({ status: '::error::x', outcome: '::error::y', covers: '::error::z' });
  const result = dataGate(intake({ data: ['health'], decision: DECISION }), { readMain: mainWith(text) });
  assert.ok(!JSON.stringify(result).includes('::'));
});
