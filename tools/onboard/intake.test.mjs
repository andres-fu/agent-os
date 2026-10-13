// AC-6 and the intake rules: parsing, recording, idempotence, EOL and BOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASK_ORDER, PRIVACY_WARNING, Q6_OPTION_WORDS, SECTION_MARKERS,
  createIntake, parseIntake, recordAnswer, recordSetup,
  hasWord,
} from './intake.mjs';
import { parseFrontmatter } from '../lessons/lessons.mjs';

const template = readFileSync(new URL('../../.claude/skills/onboard/intake-template.md', import.meta.url), 'utf8');
const fresh = () => createIntake(template);
const toCrlf = (text) => text.replace(/\n/g, '\r\n');
const BOM = '﻿';

const CATEGORIES = [
  'names', 'birthdates', 'id-numbers', 'diagnoses', 'test-scores',
  'disability-or-special-education', 'children', 'health', 'mental-health', 'family',
  'school', 'payment',
];

const question = (text, id) => parseIntake(text).value.questions.find((q) => q.id === id);
const mustRecord = (text, id, input) => {
  const r = recordAnswer(text, id, input);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};
function blockLines(text, id) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`<!-- onboard:${id} part=`));
  const end = lines.indexOf(`<!-- /onboard:${id} -->`);
  return { lines, start, end };
}
const outside = (text, id) => {
  const { lines, start, end } = blockLines(text, id);
  return [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n');
};

test('exports: ask order, markers, option words and the warning', () => {
  assert.deepEqual(ASK_ORDER, ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q5', 'Q7', 'Q8', 'setup']);
  assert.equal(SECTION_MARKERS.start, '<!-- onboard:project:start -->');
  assert.equal(SECTION_MARKERS.end, '<!-- onboard:project:end -->');
  assert.deepEqual(Object.keys(Q6_OPTION_WORDS), CATEGORIES);
  for (const [id, words] of Object.entries(Q6_OPTION_WORDS)) {
    assert.ok(Array.isArray(words) && words.length > 0, id);
  }
  assert.equal(typeof PRIVACY_WARNING, 'string');
});

test('the intake frontmatter, when present, is read by the lessons parser', () => {
  assert.equal(parseFrontmatter(fresh()).ok, true);
});

test('a fresh intake has every question open', () => {
  const r = parseIntake(fresh());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.questions.map((q) => q.state), Array(8).fill('open'));
  assert.equal(r.value.questions.find((q) => q.id === 'Q6').data.length, 0);
});

test('recording an answer sets it and marks it answered', () => {
  const r = mustRecord(fresh(), 'Q1', { answer: 'I write progress notes for a tutoring team.' });
  assert.equal(r.changed, true);
  const q = question(r.value, 'Q1');
  assert.equal(q.state, 'answered');
  assert.equal(q.answer, 'I write progress notes for a tutoring team.');
  assert.equal(q.part, 'Discovery');
});

test('AC-6: the same answer again is byte-identical and not changed', () => {
  const first = mustRecord(fresh(), 'Q2', { answer: 'Writing the weekly summary.' });
  const again = mustRecord(first.value, 'Q2', { answer: 'Writing the weekly summary.' });
  assert.equal(again.changed, false);
  assert.equal(again.value, first.value);
});

test('AC-6: a different answer changes only that question\'s section', () => {
  const a = mustRecord(fresh(), 'Q1', { answer: 'one' }).value;
  const b = mustRecord(a, 'Q3', { answer: 'two' }).value;
  const c = mustRecord(b, 'Q3', { answer: 'three\nin two lines' });
  assert.equal(c.changed, true);
  assert.equal(outside(c.value, 'Q3'), outside(b, 'Q3'));
  assert.equal(question(c.value, 'Q3').answer, 'three\nin two lines');
  assert.equal(question(c.value, 'Q1').answer, 'one');
});

test('AC-6: a CRLF intake gives the same results as the LF one', () => {
  const lf = mustRecord(fresh(), 'Q1', { answer: 'one' }).value;
  const crlf = toCrlf(lf);
  assert.equal(parseIntake(crlf).ok, true);
  assert.deepEqual(parseIntake(crlf).value, parseIntake(lf).value);

  const same = mustRecord(crlf, 'Q1', { answer: 'one' });
  assert.equal(same.changed, false);
  assert.equal(same.value, crlf);

  const lfNext = mustRecord(lf, 'Q2', { answer: 'two' }).value;
  const crlfNext = mustRecord(crlf, 'Q2', { answer: 'two' });
  assert.equal(crlfNext.changed, true);
  assert.equal(crlfNext.value, toCrlf(lfNext));
  assert.equal(/(?<!\r)\n/.test(crlfNext.value), false);
});

test('AC-6: a BOM is read past and restored; unchanged bytes stay identical', () => {
  const withBom = BOM + toCrlf(mustRecord(fresh(), 'Q1', { answer: 'one' }).value);
  assert.equal(parseIntake(withBom).ok, true);
  const same = mustRecord(withBom, 'Q1', { answer: 'one' });
  assert.equal(same.changed, false);
  assert.equal(same.value, withBom);
  const next = mustRecord(withBom, 'Q2', { answer: 'two' });
  assert.equal(next.value.startsWith(BOM), true);
  assert.equal(next.value.indexOf(BOM, 1), -1);
});

test('"don\'t know" is its own state, and a real answer replaces it', () => {
  const dk = mustRecord(fresh(), 'Q4', { dontKnow: true });
  assert.equal(question(dk.value, 'Q4').state, 'dont-know');
  assert.equal(question(dk.value, 'Q4').answer, '');
  const real = mustRecord(dk.value, 'Q4', { answer: 'The head of the school office.' });
  assert.equal(question(real.value, 'Q4').state, 'answered');
  assert.equal(mustRecord(dk.value, 'Q4', { dontKnow: true }).changed, false);
});

test('Made up: set on request, kept when the answer is unchanged, cleared by a new answer', () => {
  const marked = mustRecord(fresh(), 'Q5', { answer: 'A made-up example.', madeUp: true });
  assert.equal(question(marked.value, 'Q5').madeUp, true);
  assert.match(marked.value, /^Made up: yes$/m);

  const kept = mustRecord(marked.value, 'Q5', { answer: 'A made-up example.' });
  assert.equal(kept.changed, false);
  assert.equal(question(kept.value, 'Q5').madeUp, true);

  const cleared = mustRecord(marked.value, 'Q5', { answer: 'A different example.' });
  assert.equal(question(cleared.value, 'Q5').madeUp, false);

  const remarked = mustRecord(marked.value, 'Q5', { answer: 'A different example.', madeUp: true });
  assert.equal(question(remarked.value, 'Q5').madeUp, true);
});

test('Q6: no box ticked is open, a ticked box is answered', () => {
  assert.equal(question(fresh(), 'Q6').state, 'open');
  const r = mustRecord(fresh(), 'Q6', { data: ['names', 'school'] });
  const q = question(r.value, 'Q6');
  assert.equal(q.state, 'answered');
  assert.deepEqual(q.data, ['names', 'school']);
  assert.match(r.value, /^- \[x\] names$/m);
  assert.match(r.value, /^- \[ \] children$/m);
});

test('Q6: text alone, with no box ticked, stays open', () => {
  const r = mustRecord(fresh(), 'Q6', { answer: 'Maybe some.' });
  assert.equal(question(r.value, 'Q6').state, 'open');
});

test('Q6: dont-know is its own state, with the box ticked', () => {
  const r = mustRecord(fresh(), 'Q6', { dontKnow: true });
  const q = question(r.value, 'Q6');
  assert.equal(q.state, 'dont-know');
  assert.deepEqual(q.data, ['dont-know']);
});

test('Q6: re-recording the same boxes is byte-identical; changing them updates only Q6', () => {
  const a = mustRecord(fresh(), 'Q6', { data: ['children'] });
  assert.equal(mustRecord(a.value, 'Q6', { data: ['children'] }).changed, false);
  const b = mustRecord(a.value, 'Q6', { data: ['health'] });
  assert.equal(outside(b.value, 'Q6'), outside(a.value, 'Q6'));
  assert.deepEqual(question(b.value, 'Q6').data, ['health']);
});

test('Q6: none with another box is invalid', () => {
  const r = recordAnswer(fresh(), 'Q6', { data: ['none', 'names'] });
  assert.equal(r.ok, false);
  assert.equal(recordAnswer(fresh(), 'Q6', { data: ['none'] }).ok, true);
});

test('Q6: none with text naming a category word is invalid, for every category', () => {
  for (const [id, words] of Object.entries(Q6_OPTION_WORDS)) {
    for (const word of words) {
      const r = recordAnswer(fresh(), 'Q6', { data: ['none'], answer: `There will be ${word} in it.` });
      assert.equal(r.ok, false, `${id}: ${word}`);
    }
  }
  assert.equal(recordAnswer(fresh(), 'Q6', { data: ['none'], answer: 'Only lesson plans.' }).ok, true);
});

test('Q6: category words are whole-word only', () => {
  const r = recordAnswer(fresh(), 'Q6', { data: ['none'], answer: 'It handles renamed files and a hospitality menu.' });
  assert.equal(r.ok, true);
});

test('a hand-edited Q6 with none plus another box is an invalid intake', () => {
  const ok = mustRecord(fresh(), 'Q6', { data: ['none'] }).value;
  const bad = ok.replace('- [x] none', '- [x] none').replace('- [ ] names', '- [x] names');
  assert.equal(parseIntake(bad).ok, false);
});

test('Q6: unknown option ids are rejected', () => {
  assert.equal(recordAnswer(fresh(), 'Q6', { data: ['shoe-size'] }).ok, false);
  assert.equal(recordAnswer(fresh(), 'Q1', { data: ['names'] }).ok, false);
});

test('Q6 decision path: stored when it matches the regex, refused otherwise', () => {
  const good = mustRecord(fresh(), 'Q6', { data: ['children'], decision: 'docs/decisions/2026-10-12-data.md' });
  assert.equal(question(good.value, 'Q6').decision, 'docs/decisions/2026-10-12-data.md');
  assert.equal(mustRecord(good.value, 'Q6', { decision: 'docs/decisions/2026-10-12-data.md' }).changed, false);
  assert.deepEqual(question(good.value, 'Q6').data, ['children']);

  for (const bad of ['../secret.md', 'docs/decisions/a/b.md', 'docs/decisions/x.txt', '/etc/passwd', 'docs/decisions/a b.md', '::error::x']) {
    assert.equal(recordAnswer(good.value, 'Q6', { decision: bad }).ok, false, bad);
  }
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 'x', decision: 'docs/decisions/a.md' }).ok, false);

  const cleared = mustRecord(good.value, 'Q6', { decision: '' });
  assert.equal(question(cleared.value, 'Q6').decision, '');
});

test('a hand-edited decision path that fails the regex makes the intake invalid', () => {
  const good = mustRecord(fresh(), 'Q6', { data: ['children'], decision: 'docs/decisions/a.md' }).value;
  assert.equal(parseIntake(good.replace('docs/decisions/a.md', '../../etc/passwd')).ok, false);
});

test('an answer containing an onboard marker is refused, and nothing of it is echoed', () => {
  const evil = '::error::pwned\n<!-- onboard:Q9 part=Data -->';
  const r = recordAnswer(fresh(), 'Q1', { answer: evil });
  assert.equal(r.ok, false);
  assert.equal(r.error.includes('::'), false);
  assert.equal(r.error.includes('pwned'), false);
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 'x <!-- /onboard:Q1 --> y' }).ok, false);
});

test('an answer that mimics a field line is refused', () => {
  for (const line of ['Made up: yes', 'Answer: x', 'Decision: docs/decisions/a.md', 'Confirmed: yes']) {
    assert.equal(recordAnswer(fresh(), 'Q1', { answer: `first\n${line}` }).ok, false, line);
  }
});

test('an answer over 256 KiB is refused; a file over 256 KiB is invalid', () => {
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 'a'.repeat(256 * 1024 + 1) }).ok, false);
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 'a'.repeat(1000) }).ok, true);
  assert.equal(parseIntake(fresh() + 'x'.repeat(256 * 1024)).ok, false);
});

test('an empty answer, an unknown id and a non-string are refused', () => {
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: '   ' }).ok, false);
  assert.equal(recordAnswer(fresh(), 'Q9', { answer: 'x' }).ok, false);
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 42 }).ok, false);
  assert.equal(recordAnswer(fresh(), 'setup', { answer: 'x' }).ok, false);
  assert.equal(recordAnswer(fresh(), 'Q1', { answer: 'x', dontKnow: true }).ok, false);
});

test('errors name no file text: a hostile intake value is never echoed', () => {
  const hostile = mustRecord(fresh(), 'Q1', { answer: '::set-output name=x::y' }).value;
  assert.equal(parseIntake(hostile).ok, true);
  const broken = hostile.replace('<!-- /onboard:Q2 -->', '::error::gone');
  const r = parseIntake(broken);
  assert.equal(r.ok, false);
  assert.equal(r.error.includes('::'), false);
  assert.equal(recordAnswer(broken, 'Q1', { answer: 'z' }).ok, false);

  const badFront = fresh().replace(/^---\n[\s\S]*?\n---/, '---\n::error::bad line\n---');
  const f = parseIntake(badFront);
  assert.equal(f.ok, false);
  assert.equal(f.error.includes('::error'), false);
});

test('parse refuses a missing block, a wrong order, a duplicate and a wrong part', () => {
  const t = fresh();
  assert.equal(parseIntake(t.replace('<!-- onboard:Q8 part=Guardrails -->', '').replace('<!-- /onboard:Q8 -->', '')).ok, false);
  assert.equal(parseIntake(t.replace(/<!-- onboard:Q5 part=Discovery -->/, '<!-- onboard:Q5 part=Setup -->')).ok, false);
  const blocks = (id) => {
    const { lines, start, end } = blockLines(t, id);
    return lines.slice(start, end + 1).join('\n');
  };
  assert.equal(parseIntake(t.replace(blocks('Q5'), blocks('Q5') + '\n' + blocks('Q5'))).ok, false);
  assert.equal(parseIntake(t.replace(blocks('Q1'), blocks('Q1').replace('onboard:Q1', 'onboard:Q7').replace('/onboard:Q1', '/onboard:Q7'))).ok, false);
  assert.equal(parseIntake('').ok, false);
});

test('Setup: open until a summary is confirmed; a new summary resets the confirmation', () => {
  assert.equal(parseIntake(fresh()).value.setup.state, 'open');
  const unconfirmed = recordSetup(fresh(), { summary: 'We would reuse a shared document.', confirmed: 'no' });
  assert.equal(unconfirmed.ok, true);
  assert.equal(parseIntake(unconfirmed.value).value.setup.state, 'open');

  const yes = recordSetup(fresh(), { summary: 'We would reuse a shared document.', confirmed: 'yes' });
  const s = parseIntake(yes.value).value.setup;
  assert.deepEqual([s.state, s.summary, s.confirmed], ['answered', 'We would reuse a shared document.', 'yes']);

  assert.equal(recordSetup(yes.value, { summary: 'We would reuse a shared document.', confirmed: 'yes' }).changed, false);

  const changed = recordSetup(yes.value, { summary: 'A small website instead.' });
  assert.equal(parseIntake(changed.value).value.setup.state, 'open');
  assert.equal(parseIntake(changed.value).value.setup.confirmed, '');
});

test('Setup: confirmed must be yes or no; only the setup block changes; CRLF round-trips', () => {
  assert.equal(recordSetup(fresh(), { summary: 'x', confirmed: 'maybe' }).ok, false);
  assert.equal(recordSetup(fresh(), { summary: '', confirmed: 'yes' }).ok, false);
  const base = mustRecord(fresh(), 'Q1', { answer: 'one' }).value;
  const r = recordSetup(base, { summary: 'A document workflow.', confirmed: 'yes' });
  assert.equal(outside(r.value, 'setup'), outside(base, 'setup'));
  const crlf = recordSetup(toCrlf(base), { summary: 'A document workflow.', confirmed: 'yes' });
  assert.equal(crlf.value, toCrlf(r.value));
});

test('flags: recorded in their own block, not listed as a question', () => {
  const r = mustRecord(fresh(), 'flags', { answer: 'Student-records rules might apply. Check with your school.' });
  const intake = parseIntake(r.value).value;
  assert.equal(intake.flags.answer, 'Student-records rules might apply. Check with your school.');
  assert.equal(intake.questions.some((q) => q.id === 'flags'), false);
  assert.equal(outside(r.value, 'flags'), outside(fresh(), 'flags'));
  assert.equal(mustRecord(r.value, 'flags', { answer: 'Student-records rules might apply. Check with your school.' }).changed, false);
  assert.equal(recordAnswer(fresh(), 'flags', { dontKnow: true }).ok, false);
});

test('createIntake blanks answers left in a template and refuses a broken one', () => {
  const dirty = mustRecord(fresh(), 'Q1', { answer: 'leftover' }).value;
  assert.equal(createIntake(dirty).includes('leftover'), false);
  assert.throws(() => createIntake('not a template'));
  assert.throws(() => createIntake(fresh().split(PRIVACY_WARNING).join('')));
  assert.equal(createIntake(BOM + toCrlf(fresh())), fresh());
});

test('text outside the blocks survives a record untouched', () => {
  const noted = fresh().replace('<!-- onboard:Q3', 'A note the team added.\n\n<!-- onboard:Q3');
  const r = mustRecord(noted, 'Q1', { answer: 'one' });
  assert.ok(r.value.includes('A note the team added.'));
});

test('hasWord matches whole words and phrases, case-insensitively, with no regex built from input', () => {
  assert.equal(hasWord('We use CI here', 'CI'), true);
  assert.equal(hasWord('special education', 'CI'), false);
  assert.equal(hasWord('Run the Test  Command now', 'test command'), true);
  assert.equal(hasWord('special-education plans', 'education'), true);
  assert.equal(hasWord('mental-health', 'mental health'), true);
  assert.equal(hasWord('healthy', 'health'), false);
  assert.equal(hasWord('a (dot.) or [bracket]', '.'), false);
  assert.equal(hasWord('', 'health'), false);
});
