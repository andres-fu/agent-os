// The /onboard project section in CLAUDE.md, between SECTION_MARKERS.
// Pure function on text: no file access. Rules (docs/specs/2026-10-11-onboard-plan.md):
//  - No markers: append the section. One start and one end, in order: replace between them.
//    Anything else is an error.
//  - Outside the markers the bytes are untouched, including a BOM and CRLF.
//    The file is not normalised; only the inserted text uses the file's line ending.
//  - Errors are fixed messages and never echo file text.
// No dependencies: Node 20+.

import { SECTION_MARKERS } from './intake.mjs';

export const MAX_WORDS = 100;

const ERRORS = {
  input: 'The CLAUDE.md text is missing or not text.',
  body: 'The project section must be non-empty text.',
  words: 'The project section is over 100 words.',
  bodyMarker: 'The project section cannot contain an onboard marker.',
  markers: 'CLAUDE.md must have no onboard project markers, or exactly one start followed by one end.',
};

const fail = (key) => ({ ok: false, error: ERRORS[key] });

function positions(text, needle) {
  const found = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) found.push(i);
  return found;
}

/** Words as PR 1's AC-2 counts them: runs of non-space, so "special-education" is one. */
const countWords = (text) => text.trim().split(/\s+/).length;

/**
 * Puts `body` (at most 100 words) between the project markers in `claudeText`.
 * Returns { ok, value, changed }; when nothing changes, `value` is the original text.
 */
export function applySection(claudeText, body) {
  if (typeof claudeText !== 'string') return fail('input');
  if (typeof body !== 'string' || body.trim() === '') return fail('body');
  if (/<!--\s*\/?onboard:/.test(body)) return fail('bodyMarker');
  if (countWords(body) > MAX_WORDS) return fail('words');

  const starts = positions(claudeText, SECTION_MARKERS.start);
  const ends = positions(claudeText, SECTION_MARKERS.end);
  const eol = claudeText.includes('\r\n') ? '\r\n' : '\n';
  const inner = body.trim().replace(/\r\n?|\n/g, eol);
  const section = `${SECTION_MARKERS.start}${eol}${inner}${eol}${SECTION_MARKERS.end}`;

  let value;
  if (starts.length === 0 && ends.length === 0) {
    if (claudeText === '') {
      value = section + eol;
    } else {
      const lead = claudeText.endsWith('\n') ? eol : eol + eol;
      value = claudeText + lead + section + eol;
    }
  } else if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
    value = claudeText.slice(0, starts[0]) + section + claudeText.slice(ends[0] + SECTION_MARKERS.end.length);
  } else {
    return fail('markers');
  }
  return { ok: true, value: value === claudeText ? claudeText : value, changed: value !== claudeText };
}
