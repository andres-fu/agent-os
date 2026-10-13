// AC-2 and AC-3 (template half): the intake template is the questionnaire, so
// its wording rules are checked here, on the file itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASK_ORDER, PRIVACY_WARNING, createIntake, parseIntake } from './intake.mjs';

const TEMPLATE_URL = new URL('../../.claude/skills/onboard/intake-template.md', import.meta.url);
const template = readFileSync(TEMPLATE_URL, 'utf8').replace(/\r\n/g, '\n');
const lines = template.split('\n');

const DOC_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'flags', 'Q5', 'Q7', 'Q8', 'setup'];
const QUESTION_IDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'];

const BANNED = [
  'dependency', 'stack', 'repository', 'CI', 'deploy', 'test command', 'API', 'database',
  'server', 'PII', 'compliance', 'personal data',
];
const bannedIn = (text) => BANNED.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(text));

function block(id) {
  const start = lines.findIndex((l) => l.startsWith(`<!-- onboard:${id} part=`));
  const end = lines.indexOf(`<!-- /onboard:${id} -->`);
  assert.ok(start !== -1 && end > start, `block ${id} exists`);
  return { start, end, lines: lines.slice(start, end + 1), text: lines.slice(start, end + 1).join('\n') };
}
const headingOf = (id) => block(id).lines.find((l) => l.startsWith('### ')).replace(/^### \S+\.\s*/, '');

test('blocks appear in ask order, with the data flags right after Q6', () => {
  const found = [...template.matchAll(/^<!-- onboard:(\w+) part=\w+ -->$/gm)].map((m) => m[1]);
  assert.deepEqual(found, DOC_ORDER);
  assert.deepEqual(ASK_ORDER, ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q5', 'Q7', 'Q8', 'setup']);
  assert.deepEqual(found.filter((id) => id !== 'flags'), ASK_ORDER);
});

test('every block has a part and a closing marker', () => {
  const parts = Object.fromEntries(
    [...template.matchAll(/^<!-- onboard:(\w+) part=(\w+) -->$/gm)].map((m) => [m[1], m[2]]),
  );
  assert.deepEqual(parts, {
    Q1: 'Discovery', Q2: 'Discovery', Q3: 'Discovery', Q4: 'Discovery', Q5: 'Discovery',
    Q6: 'Data', flags: 'Data', Q7: 'Guardrails', Q8: 'Guardrails', setup: 'Setup',
  });
});

test('at most 8 questions, each with an example, a "don\'t know" line, Answer and Made up', () => {
  const questionBlocks = DOC_ORDER.filter((id) => /^Q\d$/.test(id));
  assert.ok(questionBlocks.length <= 8);
  assert.deepEqual([...questionBlocks].sort(), QUESTION_IDS);
  for (const id of QUESTION_IDS) {
    const b = block(id);
    assert.equal(b.lines.filter((l) => l.startsWith('### ')).length, 1, `${id} heading`);
    assert.ok(b.lines.some((l) => l.startsWith('Example: ')), `${id} Example`);
    assert.ok(b.lines.some((l) => /don'?t know|dont-know/i.test(l)), `${id} don't know line`);
    assert.ok(b.lines.includes('Answer:'), `${id} Answer`);
    assert.ok(b.lines.includes('Made up:'), `${id} Made up`);
  }
});

test('Q6 heading is the spec wording and 25 words, with special-education as one word', () => {
  const q6 = headingOf('Q6');
  assert.equal(
    q6,
    'Will it include any of: names, birthdates, ID numbers, diagnoses, test scores, ' +
      'disability or special-education details, children, health, mental health, family, ' +
      'school or payment details?',
  );
  assert.equal(q6.trim().split(/\s+/).length, 25);
});

test('every question heading is at most 25 words', () => {
  for (const id of QUESTION_IDS) {
    const words = headingOf(id).trim().split(/\s+/).length;
    assert.ok(words <= 25, `${id} has ${words} words`);
  }
});

test('Q6 names every data category the spec lists (AC-3)', () => {
  const q6 = headingOf('Q6');
  for (const phrase of [
    'names', 'birthdates', 'ID numbers', 'diagnoses', 'test scores',
    'disability or special-education details', 'children', 'health', 'mental health',
    'family', 'school', 'payment',
  ]) {
    assert.ok(q6.includes(phrase), phrase);
  }
});

test('the banned-word matcher is whole-word and case-insensitive', () => {
  assert.deepEqual(bannedIn('special education and test scores'), []);
  assert.deepEqual(bannedIn('We use ci here'), ['CI']);
  assert.deepEqual(bannedIn('a Database and an api'), ['API', 'database'].sort((a, b) => BANNED.indexOf(a) - BANNED.indexOf(b)));
  assert.deepEqual(bannedIn('Personal  data'), []);
  assert.deepEqual(bannedIn('the test command'), ['test command']);
});

test('no question block contains a banned technical word (AC-2)', () => {
  for (const id of QUESTION_IDS) {
    assert.deepEqual(bannedIn(block(id).text), [], `${id} block`);
  }
});

test('the setup and flags blocks also avoid the banned words', () => {
  assert.deepEqual(bannedIn(block('setup').text), []);
  assert.deepEqual(bannedIn(block('flags').text), []);
});

test('Q6 has the checkbox ids in order, and a Decision line', () => {
  const boxes = block('Q6').lines
    .map((l) => /^- \[ \] (\S+)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.deepEqual(boxes, [
    'names', 'birthdates', 'id-numbers', 'diagnoses', 'test-scores',
    'disability-or-special-education', 'children', 'health', 'mental-health', 'family',
    'school', 'payment', 'none', 'dont-know',
  ]);
  assert.ok(block('Q6').lines.includes('Decision:'));
});

test('the privacy warning appears exactly before Q1, Q6 and Q5 (AC-3)', () => {
  assert.ok(PRIVACY_WARNING.length > 0 && !PRIVACY_WARNING.includes('\n'));
  assert.match(PRIVACY_WARNING, /saved in the project for good/);
  assert.match(PRIVACY_WARNING, /anyone who can see the project can read it/);
  assert.equal(lines.filter((l) => l === PRIVACY_WARNING).length, 3);
  for (const id of ['Q1', 'Q6', 'Q5']) {
    const { start } = block(id);
    let i = start - 1;
    while (i >= 0 && lines[i].trim() === '') i--;
    assert.equal(lines[i], PRIVACY_WARNING, `warning before ${id}`);
  }
});

test('the flags block is part Data, is not a question and starts empty', () => {
  const intake = parseIntake(template);
  assert.equal(intake.ok, true);
  assert.equal(intake.value.questions.some((q) => q.id === 'flags'), false);
  assert.equal(intake.value.flags.part, 'Data');
  assert.equal(intake.value.flags.answer, '');
});

test('the template parses as it is, and createIntake gives an all-open intake', () => {
  const created = parseIntake(createIntake(template));
  assert.equal(created.ok, true);
  assert.deepEqual(created.value.questions.map((q) => q.id), ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q5', 'Q7', 'Q8']);
  for (const q of created.value.questions) {
    assert.equal(q.state, 'open', q.id);
    assert.equal(q.madeUp, false, q.id);
  }
  assert.equal(created.value.setup.state, 'open');
});
