// Finds text that looks like a real identifier (AC-10). Results carry only the
// kind, never the matched text, so a warning cannot leak what it found.
//
//   findIdentifiers(text) -> [{ kind: 'email' | 'phone' | 'id-number' | 'date' }]
//
// All patterns are literals with bounded or lookbehind-anchored repeats, so
// they run in linear time. No RegExp is built from input. Node 20+.

// The lookbehind makes a match start only at the beginning of a run of local
// characters, so a long run without "@" is scanned once, not once per start.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE =
  /(?<![\d+(])(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\d)|(?<![\d+])\+\d{1,3}(?:[ .-]\d{2,4}){2,4}(?!\d)/g;
const ID_LONG = /\d{8,}/g;
const ID_SSN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g;
const DATE_ISO = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;
const DATE_US = /(?<!\d)\d{1,2}\/\d{1,2}\/\d{4}(?!\d)/g;
// Month names are spelled out in the literal: no RegExp is built from a string.
const DATE_NAMED =
  /(?<![A-Za-z])(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}(?!\d)/gi;

const PATTERNS = [
  ['email', [EMAIL]],
  ['id-number', [ID_LONG, ID_SSN]],
  ['date', [DATE_ISO, DATE_US, DATE_NAMED]],
  ['phone', [PHONE]],
];

function spansOf(text, regexes) {
  const spans = [];
  for (const re of regexes) {
    for (const m of text.matchAll(re)) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/**
 * Returns one `{ kind }` per match. A phone-shaped match that overlaps an
 * id-number, date or email is dropped, so one piece of text is reported once.
 */
export function findIdentifiers(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');

  const results = [];
  const claimed = [];
  for (const [kind, regexes] of PATTERNS) {
    for (const span of spansOf(text, regexes)) {
      if (kind === 'phone' && claimed.some((c) => overlaps(c, span))) continue;
      claimed.push(span);
      results.push({ kind });
    }
  }
  return results;
}
