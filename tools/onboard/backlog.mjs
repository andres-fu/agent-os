// The /onboard backlog: render it from slices, check it from text (AC-12).
// Pure functions on text: no file access, no CLI (generate.mjs is the CLI layer).
//
//   renderBacklog(slices) -> string        (throws Error with fixed text when a slice is invalid)
//   validateBacklog(text) -> { errors }    (fixed ids; never any text from the backlog)
//
// A slice is { text, doneWhen, next }. Rules: 3 to 7 slices, one plain sentence
// each, a non-empty "Done when", exactly one next, and no dates or IDs (the
// strict validate of PR 1 fails a dated backlog line, so they are refused here).
// No RegExp is built from input. Node 20+.

import { findIdentifiers } from './identifiers.mjs';

export const MIN_SLICES = 3;
export const MAX_SLICES = 7;

const SENTENCE = /^[^.!?\n\r]+\.$/;
const SLICE_LINE = /^- \[(next| )\] (.*)$/;
const DONE_LINE = /^ {2}Done when: ?(.*)$/;

const ERRORS = {
  input: 'backlog-input',
  line: 'backlog-line',
  count: 'backlog-slice-count',
  next: 'backlog-next-count',
  sentence: 'backlog-sentence',
  doneWhen: 'backlog-done-when',
  dateOrId: 'backlog-date-or-id',
};

const isSentence = (text) => typeof text === 'string' && SENTENCE.test(text.trim()) && text.trim().length > 1;
const stripStop = (text) => text.trim().replace(/\.$/, '').trim();
const hasIdentifier = (text) => typeof text === 'string' && findIdentifiers(text).length > 0;

/** Checks input slices. Returns fixed messages that name a slice by number only. */
function checkSlices(slices) {
  if (!Array.isArray(slices)) return ['The backlog needs a list of slices.'];
  const problems = [];
  if (slices.length < MIN_SLICES || slices.length > MAX_SLICES) {
    problems.push(`Use ${MIN_SLICES} to ${MAX_SLICES} slices.`);
  }
  let nexts = 0;
  slices.forEach((s, i) => {
    const n = i + 1;
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      problems.push(`Fix slice ${n}: it is not a slice.`);
      return;
    }
    if (s.next !== true && s.next !== false) problems.push(`Fix slice ${n}: next must be true or false.`);
    if (s.next === true) nexts++;
    if (!isSentence(s.text)) problems.push(`Fix slice ${n}: write one plain sentence ending in a full stop.`);
    const done = typeof s.doneWhen === 'string' ? stripStop(s.doneWhen) : '';
    if (done === '' || /[\r\n]/.test(done)) problems.push(`Fix slice ${n}: add a one-line "Done when".`);
    if (hasIdentifier(s.text) || hasIdentifier(s.doneWhen)) {
      problems.push(`Remove the date or ID from slice ${n}; write 'week 2' instead of a date.`);
    }
  });
  if (nexts !== 1) problems.push('Mark exactly one slice as next.');
  return problems;
}

/** Backlog text for `slices`. Throws an Error with fixed messages when a slice breaks a rule. */
export function renderBacklog(slices) {
  const problems = checkSlices(slices);
  if (problems.length > 0) throw new Error(problems.join(' '));
  return (
    slices
      .map((s) => `- [${s.next ? 'next' : ' '}] ${s.text.trim()}\n  Done when: ${stripStop(s.doneWhen)}.`)
      .join('\n') + '\n'
  );
}

/** Checks backlog text against the rules. `errors` holds fixed ids, in a fixed order, once each. */
export function validateBacklog(text) {
  if (typeof text !== 'string') return { errors: [ERRORS.input] };
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');

  const found = new Set();
  let count = 0;
  let nexts = 0;
  let waitingForDone = false;
  const closeSlice = () => {
    if (waitingForDone) found.add(ERRORS.doneWhen);
    waitingForDone = false;
  };

  for (const line of lines) {
    const slice = SLICE_LINE.exec(line);
    const done = DONE_LINE.exec(line);
    if (slice) {
      closeSlice();
      count++;
      if (slice[1] === 'next') nexts++;
      if (!isSentence(slice[2])) found.add(ERRORS.sentence);
      waitingForDone = true;
    } else if (done && waitingForDone) {
      if (stripStop(done[1]) === '') found.add(ERRORS.doneWhen);
      waitingForDone = false;
    } else if (line.trim() !== '') {
      found.add(ERRORS.line);
    }
  }
  closeSlice();

  if (count < MIN_SLICES || count > MAX_SLICES) found.add(ERRORS.count);
  if (nexts !== 1) found.add(ERRORS.next);
  if (hasIdentifier(text)) found.add(ERRORS.dateOrId);

  return { errors: Object.values(ERRORS).filter((e) => found.has(e)) };
}
