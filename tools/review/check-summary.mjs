// Refuse to post a review that carries a long encoded string. The reviewer
// reads text written by the PR's author, so injected instructions could make it
// copy a secret into its summary; a long unbroken base64, hex or url-safe run
// is the shape such a copy takes. A heuristic, not a guarantee.
//
//   node tools/review/check-summary.mjs < summary.md   # exit 1 if any found

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 80 characters clears a 64-character sha256 digest and a 40-character commit
// SHA, which reviews quote legitimately.
const DEFAULT_MIN_LENGTH = 80;

/** Returns every run of base64, hex or url-safe characters at least minLength long. */
export function findEncodedBlobs(text, { minLength = DEFAULT_MIN_LENGTH } = {}) {
  if (typeof text !== 'string') throw new TypeError('findEncodedBlobs needs a string');
  const pattern = new RegExp(`[A-Za-z0-9+/=_-]{${minLength},}`, 'g');
  return text.match(pattern) ?? [];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const blobs = findEncodedBlobs(readFileSync(0, 'utf8'));
  if (blobs.length > 0) {
    console.error(`summary withheld: ${blobs.length} long encoded string(s) found`);
    process.exitCode = 1;
  }
}
