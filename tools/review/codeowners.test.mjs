import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PROTECTED } from './protected-paths.mjs';

const CODEOWNERS = fileURLToPath(new URL('../../.github/CODEOWNERS', import.meta.url));

function ownedPatterns() {
  return readFileSync(CODEOWNERS, 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

test('every protected path is owned by the stakeholder in CODEOWNERS', () => {
  const patterns = ownedPatterns();
  for (const rule of PROTECTED) {
    const entry = patterns.find((p) => p.pattern === `/${rule.path}`);
    assert.ok(entry, `CODEOWNERS has no line for /${rule.path}`);
    assert.deepEqual(entry.owners, ['@andres-fu'], `/${rule.path} must be owned by @andres-fu only`);
  }
});

test('CODEOWNERS owns nothing the protected-paths rule does not protect', () => {
  const protectedPatterns = new Set(PROTECTED.map((rule) => `/${rule.path}`));
  for (const { pattern } of ownedPatterns()) {
    assert.ok(protectedPatterns.has(pattern), `CODEOWNERS line ${pattern} is not in PROTECTED`);
  }
});
