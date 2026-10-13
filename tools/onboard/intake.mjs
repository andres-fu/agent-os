// The /onboard intake: parse it, create it from the template, record answers.
// Pure functions on text: no file access, no CLI (tools/onboard/record.mjs is
// the CLI layer). Style follows tools/lessons/lessons.mjs: `{ ok, value }`
// results and one fixed message per failure.
//
// Rules this file keeps (docs/specs/2026-10-11-onboard-plan.md, "Shared conventions"):
//  - No text from the intake is ever put in an error: messages are fixed.
//  - A leading BOM is stripped and CRLF read as LF; on write the BOM and the
//    line endings are restored. Unchanged answers return the original bytes.
//  - Only the block being recorded is rewritten.
// No dependencies: Node 20+.

import { parseFrontmatter } from '../lessons/lessons.mjs';

export const PRIVACY_WARNING =
  'Do not type or paste real sensitive data. Use made-up examples, or examples with every real detail removed. ' +
  'This file is saved in the project for good, and anyone who can see the project can read it.';

/** The order the skill asks in. Q6 comes before Q5 so a sensitive project stops before an example is asked for. */
export const ASK_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q5', 'Q7', 'Q8', 'setup'];

/** The CLAUDE.md markers around the project section (used by T1.4 and T2.3). */
export const SECTION_MARKERS = {
  start: '<!-- onboard:project:start -->',
  end: '<!-- onboard:project:end -->',
};

/** The data categories a person can tick in Q6, each with words that show the category in free text. */
export const Q6_OPTION_WORDS = {
  names: ['name', 'names'],
  birthdates: ['birthdate', 'birthdates', 'birthday', 'birthdays', 'dob'],
  'id-numbers': ['id', 'ids', 'ssn', 'passport'],
  diagnoses: ['diagnosis', 'diagnoses', 'diagnosed'],
  'test-scores': ['score', 'scores', 'grade', 'grades'],
  'disability-or-special-education': [
    'disability', 'disabilities', 'disabled', 'special-education', 'special education', 'iep',
  ],
  children: ['child', 'children', 'kid', 'kids', 'student', 'students', 'pupil', 'pupils', 'minor', 'minors'],
  health: ['health', 'medical', 'illness'],
  'mental-health': ['mental', 'anxiety', 'depression', 'therapy'],
  family: ['family', 'families', 'parent', 'parents', 'sibling', 'siblings'],
  school: ['school', 'schools', 'classroom', 'classrooms'],
  payment: ['payment', 'payments', 'card', 'cards', 'billing', 'bank'],
};

/** Every box in Q6, in template order: the categories, then the two that stand alone. */
export const Q6_OPTIONS = [...Object.keys(Q6_OPTION_WORDS), 'none', 'dont-know'];

const MAX_BYTES = 256 * 1024;
const DECISION_PATTERN = /^docs\/decisions\/[A-Za-z0-9._-]+\.md$/;
const DOC_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'flags', 'Q5', 'Q7', 'Q8', 'setup'];
const QUESTION_IDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'];
const PARTS = {
  Q1: 'Discovery', Q2: 'Discovery', Q3: 'Discovery', Q4: 'Discovery', Q5: 'Discovery',
  Q6: 'Data', flags: 'Data', Q7: 'Guardrails', Q8: 'Guardrails', setup: 'Setup',
};

const ANY_MARKER = /<!--\s*\/?onboard:/;
const START_MARKER = /^<!-- onboard:(Q[1-8]|flags|setup) part=(Discovery|Data|Guardrails|Setup) -->$/;
const END_MARKER = /^<!-- \/onboard:(Q[1-8]|flags|setup) -->$/;
const HEADING = /^### (Q[1-8]|Setup|Flags)\. (\S.*)$/;
const CHECKBOX = /^- \[( |x)\] (\S+)$/;
const FIELD_LINE = /^(Answer|Decision|Confirmed|Made up):(.*)$/;
const RESERVED_LINE = /^(Answer|Decision|Confirmed|Made up)\s*:/i;
const DONT_KNOW = /^dont-know$/i;

const ERRORS = {
  input: 'The intake text is missing or not text.',
  size: 'The intake is over 256 KiB.',
  frontmatter: 'The intake frontmatter is not valid.',
  markers: 'The intake has a missing, repeated, misplaced or malformed onboard marker.',
  blocks: 'The intake blocks are not the expected ones, in the expected order.',
  block: 'An intake block is malformed.',
  made: 'A "Made up:" value must be blank or yes.',
  confirmed: 'A "Confirmed:" value must be blank, yes or no.',
  decision: 'A decision path must look like docs/decisions/<name>.md.',
  none: 'Q6 "none" cannot be combined with another box or with text naming a data category.',
  unknownId: 'That is not a question id this intake records.',
  answerType: 'The answer must be text.',
  empty: 'The answer is empty.',
  both: 'Give an answer or "dont-know", not both.',
  field: 'That field does not apply to this question.',
  options: 'Q6 options must be a list of known option ids.',
  marker: 'An answer cannot contain an onboard marker.',
  reserved: 'An answer line cannot start with a field name such as "Made up:".',
  summary: 'The setup summary must be non-empty text.',
  confirmValue: 'Confirmed must be yes or no.',
  internal: 'The recorded intake did not pass its own check.',
};

const ok = (value, extra = {}) => ({ ok: true, value, ...extra });
const fail = (key) => ({ ok: false, error: ERRORS[key] });

// ---- text and line endings ------------------------------------------------

function readText(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  return { bom, crlf: body.includes('\r\n'), lines: body.replace(/\r\n/g, '\n').split('\n') };
}

const writeText = ({ bom, crlf }, lines) => (bom ? '﻿' : '') + lines.join(crlf ? '\r\n' : '\n');

const tooBig = (text) => Buffer.byteLength(text, 'utf8') > MAX_BYTES;

// ---- reading a block ------------------------------------------------------

// Lower-cases and turns every run of non-letters, non-digits into one space,
// so whole words and phrases can be matched with a plain string search.
const words = (text) => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** True when `phrase` appears in `text` as whole words, ignoring case and punctuation. */
export function hasWord(text, phrase) {
  const needle = words(phrase);
  return needle.trim() !== '' && words(text).includes(needle);
}

function wordHit(text) {
  return Object.values(Q6_OPTION_WORDS)
    .flat()
    .some((word) => hasWord(text, word));
}

function fieldLabels(id) {
  if (id === 'Q6') return ['Answer', 'Decision', 'Made up'];
  if (id === 'setup') return ['Answer', 'Confirmed', 'Made up'];
  return ['Answer', 'Made up'];
}

/** Rules that hold for any fields, whether read from a file or about to be written. */
function checkFields(id, f) {
  if (ANY_MARKER.test(f.answer)) return 'marker';
  if (id === 'Q6') {
    if (f.decision !== '' && !DECISION_PATTERN.test(f.decision)) return 'decision';
    if (f.data.includes('none') && (f.data.length > 1 || wordHit(f.answer))) return 'none';
  }
  if (id === 'setup' && !['', 'yes', 'no'].includes(f.confirmed)) return 'confirmed';
  return null;
}

function readBlock(lines, b) {
  const first = b.start + 1;
  const heading = HEADING.exec(lines[first] ?? '');
  if (!heading || heading[1].toLowerCase() !== b.id.toLowerCase()) return fail('block');

  let answerAt = -1;
  for (let i = first + 1; i < b.end; i++) {
    if (lines[i].startsWith('Answer:')) {
      answerAt = i;
      break;
    }
  }
  if (answerAt === -1) return fail('block');

  const boxes = [];
  for (let i = first + 1; i < answerAt; i++) {
    const m = CHECKBOX.exec(lines[i]);
    if (m) boxes.push({ id: m[2], ticked: m[1] === 'x', at: i });
  }
  if (b.id === 'Q6') {
    if (boxes.map((x) => x.id).join() !== Q6_OPTIONS.join()) return fail('block');
  } else if (boxes.length > 0) {
    return fail('block');
  }

  const labels = fieldLabels(b.id);
  const values = labels.map(() => '');
  const answerLines = [];
  let current = -1;
  for (let i = answerAt; i < b.end; i++) {
    const m = FIELD_LINE.exec(lines[i]);
    if (m) {
      const index = labels.indexOf(m[1]);
      if (index !== current + 1) return fail('block');
      current = index;
      if (index === 0) answerLines.push(m[2].trimStart());
      else values[index] = m[2].trim();
    } else if (current === 0) {
      answerLines.push(lines[i]);
    } else if (lines[i].trim() !== '') {
      return fail('block');
    }
  }
  if (current !== labels.length - 1) return fail('block');

  const made = values[labels.indexOf('Made up')];
  if (made !== '' && made !== 'yes') return fail('made');

  const fields = { answer: answerLines.join('\n').trim(), madeUp: made === 'yes' };
  if (b.id === 'Q6') {
    fields.data = boxes.filter((x) => x.ticked).map((x) => x.id);
    fields.decision = values[1];
  }
  if (b.id === 'setup') fields.confirmed = values[1];

  const problem = checkFields(b.id, fields);
  if (problem) return fail(problem);

  return ok({
    ...b,
    heading: heading[2].trim(),
    fieldsAt: answerAt,
    boxAt: Object.fromEntries(boxes.map((x) => [x.id, x.at])),
    fields,
  });
}

/** Finds the blocks and checks their ids, parts and order. */
function load(text) {
  if (typeof text !== 'string') return fail('input');
  if (tooBig(text)) return fail('size');

  const meta = readText(text);
  const { lines } = meta;
  if (lines[0] === '---' && !parseFrontmatter(lines.join('\n')).ok) return fail('frontmatter');

  const found = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    if (!ANY_MARKER.test(lines[i])) continue;
    const start = START_MARKER.exec(lines[i]);
    const end = END_MARKER.exec(lines[i]);
    if (start && open === null) {
      open = { id: start[1], part: start[2], start: i };
    } else if (end && open !== null && end[1] === open.id) {
      found.push({ ...open, end: i });
      open = null;
    } else {
      return fail('markers');
    }
  }
  if (open !== null) return fail('markers');

  if (found.map((b) => b.id).join() !== DOC_ORDER.join()) return fail('blocks');
  if (found.some((b) => b.part !== PARTS[b.id])) return fail('blocks');

  const blocks = new Map();
  for (const b of found) {
    const read = readBlock(lines, b);
    if (!read.ok) return read;
    blocks.set(b.id, read.value);
  }
  return ok({ meta, lines, blocks });
}

// ---- the parsed view ------------------------------------------------------

function questionState(id, f) {
  if (id === 'Q6') {
    if (f.data.includes('dont-know')) return 'dont-know';
    return f.data.length === 0 ? 'open' : 'answered';
  }
  if (DONT_KNOW.test(f.answer)) return 'dont-know';
  return f.answer === '' ? 'open' : 'answered';
}

/** Parses an intake into { questions, setup, flags }. Errors are fixed messages, never intake text. */
export function parseIntake(text) {
  const loaded = load(text);
  if (!loaded.ok) return loaded;
  const { blocks } = loaded.value;

  const questions = [];
  for (const id of ASK_ORDER.filter((x) => x !== 'setup')) {
    const b = blocks.get(id);
    const state = questionState(id, b.fields);
    const q = {
      id,
      part: b.part,
      heading: b.heading,
      state,
      answer: state === 'dont-know' ? '' : b.fields.answer,
      madeUp: b.fields.madeUp,
    };
    if (id === 'Q6') {
      q.data = [...b.fields.data];
      q.decision = b.fields.decision;
    }
    questions.push(q);
  }

  const s = blocks.get('setup');
  const f = blocks.get('flags');
  return ok({
    questions,
    setup: {
      id: 'setup',
      part: s.part,
      heading: s.heading,
      state: s.fields.answer !== '' && s.fields.confirmed === 'yes' ? 'answered' : 'open',
      summary: s.fields.answer,
      confirmed: s.fields.confirmed,
      madeUp: s.fields.madeUp,
    },
    flags: { id: 'flags', part: f.part, heading: f.heading, answer: f.fields.answer, madeUp: f.fields.madeUp },
  });
}

// ---- writing --------------------------------------------------------------

function renderFields(id, f) {
  const [firstLine, ...rest] = f.answer.split('\n');
  const out = [firstLine === '' ? 'Answer:' : `Answer: ${firstLine}`, ...rest];
  if (id === 'Q6') out.push(f.decision === '' ? 'Decision:' : `Decision: ${f.decision}`);
  if (id === 'setup') out.push(f.confirmed === '' ? 'Confirmed:' : `Confirmed: ${f.confirmed}`);
  out.push(f.madeUp ? 'Made up: yes' : 'Made up:');
  return out;
}

/** Rewrites one block's fields (and Q6's boxes) in `lines`, in place. */
function rewriteBlock(lines, b, fields) {
  if (b.id === 'Q6') {
    for (const option of Q6_OPTIONS) {
      lines[b.boxAt[option]] = `- [${fields.data.includes(option) ? 'x' : ' '}] ${option}`;
    }
  }
  lines.splice(b.fieldsAt, b.end - b.fieldsAt, ...renderFields(b.id, fields));
}

/** Blank intake text from the template: answers, ticks, decisions and confirmations all cleared. */
export function createIntake(templateText) {
  const loaded = load(templateText);
  if (!loaded.ok) throw new Error('invalid intake template');
  const { lines, blocks } = loaded.value;

  for (const id of ['Q1', 'Q6', 'Q5']) {
    let i = blocks.get(id).start - 1;
    while (i >= 0 && lines[i].trim() === '') i--;
    if (lines[i] !== PRIVACY_WARNING) throw new Error('invalid intake template');
  }

  const out = [...lines];
  for (const b of [...blocks.values()].reverse()) {
    const blank = { answer: '', madeUp: false };
    if (b.id === 'Q6') Object.assign(blank, { data: [], decision: '' });
    if (b.id === 'setup') blank.confirmed = '';
    rewriteBlock(out, b, blank);
  }
  return out.join('\n');
}

const sameFields = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function normalise(answer) {
  return answer.replace(/\r\n?/g, '\n').trim();
}

/** The Made up flag: explicit when given, otherwise cleared by new content and kept by none. */
function nextMadeUp(requested, changed, current) {
  if (requested === undefined) return changed ? false : current;
  return requested === true || requested === 'yes';
}

/** Writes `next` into block `b` and returns the whole new text, checked by reading it back. */
function commit(loaded, b, next) {
  if (sameFields(b.fields, next)) return { ok: true, value: null, changed: false };
  const lines = [...loaded.lines];
  rewriteBlock(lines, b, next);
  const text = writeText(loaded.meta, lines);
  if (tooBig(text)) return fail('size');
  if (!load(text).ok) return fail('internal');
  return { ok: true, value: text, changed: true };
}

function finish(original, result) {
  return result.ok && !result.changed ? { ok: true, value: original, changed: false } : result;
}

/**
 * Records one answer. `id` is Q1..Q8 or `flags`. Input fields are all optional:
 * `answer` (text), `dontKnow`, and for Q6 `data` (box ids) and `decision` (path or '').
 */
export function recordAnswer(text, id, input = {}) {
  const loaded = load(text);
  if (!loaded.ok) return loaded;
  if (!QUESTION_IDS.includes(id) && id !== 'flags') return fail('unknownId');
  if (input === null || typeof input !== 'object') return fail('answerType');

  const { answer, dontKnow, data, decision, madeUp } = input;
  const isQ6 = id === 'Q6';
  if (!isQ6 && (data !== undefined || decision !== undefined)) return fail('field');
  if (id === 'flags' && dontKnow) return fail('field');
  if (answer !== undefined && typeof answer !== 'string') return fail('answerType');

  const b = loaded.value.blocks.get(id);
  const next = { ...b.fields, ...(isQ6 ? { data: [...b.fields.data] } : {}) };

  let given = answer === undefined ? undefined : normalise(answer);
  if (given !== undefined) {
    if (ANY_MARKER.test(given)) return fail('marker');
    if (given.split('\n').slice(1).some((line) => RESERVED_LINE.test(line))) return fail('reserved');
    if (tooBig(given)) return fail('size');
    if (given === '' && !isQ6) return fail('empty');
  }
  if (dontKnow && given) return fail('both');

  if (isQ6) {
    if (data !== undefined) {
      if (!Array.isArray(data) || data.some((x) => !Q6_OPTIONS.includes(x))) return fail('options');
      if (dontKnow) return fail('both');
      next.data = Q6_OPTIONS.filter((option) => data.includes(option));
    } else if (dontKnow || (given !== undefined && DONT_KNOW.test(given))) {
      next.data = ['dont-know'];
      if (given !== undefined && DONT_KNOW.test(given)) given = '';
    }
    if (given !== undefined) next.answer = given;
    if (decision !== undefined) {
      if (typeof decision !== 'string') return fail('decision');
      next.decision = decision.trim();
    }
  } else if (dontKnow) {
    next.answer = 'dont-know';
  } else if (given !== undefined) {
    next.answer = given;
  }

  const contentChanged = next.answer !== b.fields.answer || (isQ6 && !sameFields(next.data, b.fields.data));
  next.madeUp = nextMadeUp(madeUp, contentChanged, b.fields.madeUp);

  const problem = checkFields(id, next);
  if (problem) return fail(problem);
  return finish(text, commit(loaded.value, b, next));
}

/** Records the Setup summary and whether the person confirmed it ('yes' or 'no'). */
export function recordSetup(text, { summary, confirmed, madeUp } = {}) {
  const loaded = load(text);
  if (!loaded.ok) return loaded;
  if (summary !== undefined && (typeof summary !== 'string' || normalise(summary) === '')) return fail('summary');
  if (confirmed !== undefined && confirmed !== 'yes' && confirmed !== 'no') return fail('confirmValue');

  const b = loaded.value.blocks.get('setup');
  const next = { ...b.fields };
  if (summary !== undefined) {
    const given = normalise(summary);
    if (ANY_MARKER.test(given)) return fail('marker');
    if (given.split('\n').slice(1).some((line) => RESERVED_LINE.test(line))) return fail('reserved');
    if (tooBig(given)) return fail('size');
    next.answer = given;
    if (given !== b.fields.answer) next.confirmed = '';
  }
  if (confirmed !== undefined) next.confirmed = confirmed;

  next.madeUp = nextMadeUp(madeUp, next.answer !== b.fields.answer, b.fields.madeUp);

  const problem = checkFields('setup', next);
  if (problem) return fail(problem);
  return finish(text, commit(loaded.value, b, next));
}
