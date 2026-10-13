// The sensitive-data gate: decides whether the build may go ahead after Q6.
// Pure: the decision file is read through the injected readMain. Fails closed,
// and every reason is a fixed string, never text taken from a file.

import { parseFrontmatter } from '../lessons/lessons.mjs';
import { DECISION_PATH } from './git-main.mjs';

// The only copy of the spec's "Decided on approval" item 3.
export const HIGHLY_SENSITIVE_CATEGORIES = [
  { category: 'children', options: ['children'] },
  { category: 'diagnoses or test scores', options: ['diagnoses', 'test-scores'] },
  { category: 'disabilities or special education', options: ['disability-or-special-education'] },
  { category: 'health, including mental health', options: ['health', 'mental-health'] },
  { category: 'payment details', options: ['payment'] },
  { category: 'ID numbers, government or student', options: ['id-numbers'] },
];

const SENSITIVE_IDS = new Set(HIGHLY_SENSITIVE_CATEGORIES.flatMap((c) => c.options));

const block = (decision, reason) => ({ blocked: true, decision, reason });
const firstToken = (value) => (typeof value === 'string' ? (value.trim().split(/\s+/)[0] ?? '') : '');

function idSet(value) {
  const items = Array.isArray(value) ? value : [value];
  const ids = items
    .filter((item) => typeof item === 'string')
    .flatMap((item) => item.replace(/#.*$/, '').split(/[\s,]+/))
    .filter(Boolean);
  return new Set(ids);
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

function readDecision(readMain, path) {
  try {
    const result = readMain(path);
    return result && result.found === true && typeof result.text === 'string' ? result.text : null;
  } catch {
    return null;
  }
}

/**
 * intake: parsed intake (only the Q6 question is used).
 * readMain(path) -> { found, text? }, reading from origin/main.
 */
export function dataGate(intake, { readMain }) {
  const q6 = intake?.questions?.find?.((q) => q.id === 'Q6');
  if (!q6 || q6.state === 'open') return block(null, 'Q6 is not answered');

  const ticked = Array.isArray(q6.data) ? q6.data : [];
  const needsDecision = q6.state === 'dont-know' || ticked.some((id) => SENSITIVE_IDS.has(id));
  if (!needsDecision) return { blocked: false };

  const path = typeof q6.decision === 'string' ? q6.decision.trim() : '';
  if (path === '') return block(null, 'no decision recorded: run /escalate');
  if (!DECISION_PATH.test(path)) return block(null, 'decision path is not valid');

  const raw = readDecision(readMain, path);
  if (raw === null) return block(path, 'not on origin/main: run git fetch origin');

  const parsed = parseFrontmatter(raw.replace(/^﻿/, ''));
  if (!parsed.ok) return block(path, 'not decided yet');
  const { fields } = parsed.value;

  if (firstToken(fields.status) !== 'decided') return block(path, 'not decided yet');
  const outcome = firstToken(fields.onboard_outcome);
  if (outcome === 'do-not-build') return block(path, 'decision is not to build');
  if (outcome !== 'build') return block(path, 'not decided yet');
  if (!sameSet(idSet(fields.onboard_covers ?? []), new Set(ticked))) {
    return block(path, 'decision covers different Q6 answers');
  }
  return { blocked: false };
}
