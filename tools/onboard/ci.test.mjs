// Reads gates.yml as text (no YAML dependency) and checks the project-data job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GATES = fileURLToPath(new URL('../../.github/workflows/gates.yml', import.meta.url));
const text = readFileSync(GATES, 'utf8').replace(/\r\n/g, '\n');

// The job's lines: from "  project-data:" to the next two-space-indented job key.
function jobBlock(id) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `  ${id}:`);
  assert.notEqual(start, -1, `gates.yml has no job ${id}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i]) || /^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).filter((l) => !l.trim().startsWith('#'));
}

const job = () => jobBlock('project-data');

test('the job has the exact name the ruleset will require', () => {
  assert.ok(job().includes('    name: project files have no real identifiers'));
});

test('the job runs validate --strict', () => {
  assert.ok(job().some((l) => l.trim() === '- run: node tools/onboard/check.mjs validate --strict'
    || l.trim() === 'run: node tools/onboard/check.mjs validate --strict'));
});

test('the job is never skipped: no paths filter anywhere, no job-level if', () => {
  assert.ok(!/^\s*paths(-ignore)?:/m.test(text), 'gates.yml must not filter by paths');
  assert.ok(!job().some((l) => /^ {4}if:/.test(l)), 'project-data must have no job-level if');
});

test('checkout does not persist credentials', () => {
  assert.ok(job().some((l) => l.trim() === 'persist-credentials: false'));
});

test('the job uses only action SHAs already pinned elsewhere in the file', () => {
  const uses = (lines) => lines.map((l) => l.match(/uses:\s*(\S+)/)?.[1]).filter(Boolean);
  const others = ['tests', 'lessons', 'secrets', 'static-analysis', 'dependencies', 'test-edits']
    .flatMap((id) => uses(jobBlock(id)));
  const mine = uses(job());
  assert.ok(mine.length > 0);
  for (const u of mine) {
    assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${u} is not pinned to a commit`);
    assert.ok(others.includes(u), `${u} is not already used in gates.yml`);
  }
});

test('the job adds no permissions of its own', () => {
  assert.ok(!job().some((l) => /^ {4}permissions:/.test(l)));
});
