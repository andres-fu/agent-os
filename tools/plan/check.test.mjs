// The /plan skill's checker: a plan names its approach and a rejected
// alternative, its contracts, its tasks with file ownership, its AC coverage,
// what enforces each protection, its risks and its reviews, and no two tasks
// in the same wave share a file (the engineering manager's rule, until now
// prose only). Fixture format follows docs/specs/2026-10-11-onboard-plan.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { checkPlan } from './check.mjs';

const APPROVED_SPEC = '---\ntitle: x\nstatus: approved\n---\n';

function plan({ front = {}, sections = {}, tasks } = {}) {
  const fields = {
    title: 'Plan for x',
    spec: 'docs/specs/2026-10-21-x.md',
    status: 'draft',
    classification: 'non-trivial',
    owner: 'engineering-manager',
    date: '2026-10-21',
    ...front,
  };
  const frontmatter = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const taskTable =
    tasks ??
    [
      '| Task | Wave | Files it may change | ACs | First failing test |',
      '| --- | --- | --- | --- | --- |',
      '| T1 Parser | A | `tools/x/parse.mjs`, `tools/x/parse.test.mjs` | AC-1 | parses one line |',
      '| T2 Writer | A | `tools/x/write.mjs`, `tools/x/write.test.mjs` | AC-2 | writes one line |',
      '| T3 CLI | B | `tools/x/cli.mjs`, `tools/x/parse.mjs` | AC-3 | exits 2 on usage |',
    ].join('\n');
  const body = {
    'Classification and review': 'Non-trivial: `principal-engineer` reviews it first. Security review: not triggered.',
    Approach: 'Parse, then write. Rejected: one big script, because it cannot be tested in parts.',
    'Interfaces and contracts': '`parse(line) -> { ok, value }`.',
    Tasks: taskTable,
    'AC coverage': '| AC | Task |\n| --- | --- |\n| AC-1 | T1 |',
    'What enforces each protection (L-0010)': '| Protection | Enforced by |\n| --- | --- |\n| x | test |',
    Risks: 'None known.',
    ...sections,
  };
  const text = Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([heading, value]) => `## ${heading}\n${value}\n`)
    .join('\n');
  return `---\n${frontmatter}\n---\n\n${text}`;
}

test('a complete plan for an approved spec has no problems', () => {
  assert.deepEqual(checkPlan(plan(), { specText: APPROVED_SPEC }), []);
});

test('a plan for a spec that is not approved is refused', () => {
  const problems = checkPlan(plan(), { specText: '---\nstatus: draft\n---\n' });
  assert.ok(problems.some((p) => /not approved/.test(p)), problems.join('\n'));
});

test('each required frontmatter field is named when missing or wrong', () => {
  for (const field of ['title', 'spec', 'status', 'date']) {
    const problems = checkPlan(plan({ front: { [field]: undefined } }), { specText: APPROVED_SPEC });
    assert.ok(problems.some((p) => p.includes(field)), `${field}: ${problems.join(' | ')}`);
  }
  assert.ok(checkPlan(plan({ front: { classification: 'medium' } }), { specText: APPROVED_SPEC }).some((p) => /classification/.test(p)));
  assert.ok(checkPlan(plan({ front: { owner: 'developer' } }), { specText: APPROVED_SPEC }).some((p) => /owner/.test(p)));
});

test('each required section is named when missing', () => {
  for (const heading of ['Classification and review', 'Approach', 'Interfaces and contracts', 'Tasks', 'AC coverage', 'What enforces each protection (L-0010)', 'Risks']) {
    const problems = checkPlan(plan({ sections: { [heading]: undefined } }), { specText: APPROVED_SPEC });
    assert.ok(problems.some((p) => p.includes(heading.replace(/ \(L-0010\)$/, ''))), `${heading}: ${problems.join(' | ')}`);
  }
});

test('the approach names a rejected alternative', () => {
  const problems = checkPlan(plan({ sections: { Approach: 'Parse, then write.' } }), { specText: APPROVED_SPEC });
  assert.ok(problems.some((p) => /rejected alternative/.test(p)), problems.join('\n'));
});

test('a non-trivial plan routes to the principal engineer, and every plan states its security review', () => {
  const noPrincipal = checkPlan(plan({ sections: { 'Classification and review': 'Security review: no.' } }), { specText: APPROVED_SPEC });
  assert.ok(noPrincipal.some((p) => /principal-engineer/.test(p)), noPrincipal.join('\n'));
  const trivial = checkPlan(plan({ front: { classification: 'trivial' }, sections: { 'Classification and review': 'Trivial. Security review: no.' } }), { specText: APPROVED_SPEC });
  assert.deepEqual(trivial, []);
  const noSecurity = checkPlan(plan({ sections: { 'Classification and review': 'Non-trivial: `principal-engineer` first.' } }), { specText: APPROVED_SPEC });
  assert.ok(noSecurity.some((p) => /security/.test(p)), noSecurity.join('\n'));
});

test('two tasks in the same wave may not share a file', () => {
  const tasks = [
    '| Task | Wave | Files it may change | ACs | First failing test |',
    '| --- | --- | --- | --- | --- |',
    '| T1 Parser | A | `tools/x/parse.mjs` | AC-1 | a |',
    '| T2 Writer | A | `tools/x/write.mjs`, `tools/x/parse.mjs` | AC-2 | b |',
  ].join('\n');
  const problems = checkPlan(plan({ tasks }), { specText: APPROVED_SPEC });
  assert.ok(problems.some((p) => p.includes('tools/x/parse.mjs') && p.includes('T1') && p.includes('T2')), problems.join('\n'));
});

test('waves are scoped to their own task table: two PRs may each have a wave A', () => {
  // Found by the real-run test on the onboard plan: PR 2's table runs after
  // PR 1's, so its wave B is not parallel to PR 1's wave B.
  const tasks = [
    '### PR 1',
    '| Task | Wave | Files it may change | ACs | First failing test |',
    '| --- | --- | --- | --- | --- |',
    '| T1.1 Parser | A | `tools/x/parse.mjs` | AC-1 | a |',
    '',
    '### PR 2',
    '| Task | Wave | Files it may change | ACs | First failing test |',
    '| --- | --- | --- | --- | --- |',
    '| T2.1 Parser again | A | `tools/x/parse.mjs` | AC-2 | b |',
  ].join('\n');
  assert.deepEqual(checkPlan(plan({ tasks }), { specText: APPROVED_SPEC }), []);
});

test('a wave has at most three tasks (CLAUDE.md, Cost: at most 2-3 agents at once)', () => {
  const row = (n) => `| T${n} Part ${n} | A | \`tools/x/p${n}.mjs\` | AC-${n} | t |`;
  const header = ['| Task | Wave | Files it may change | ACs | First failing test |', '| --- | --- | --- | --- | --- |'];
  const three = [...header, row(1), row(2), row(3)].join('\n');
  assert.deepEqual(checkPlan(plan({ tasks: three }), { specText: APPROVED_SPEC }), []);
  const four = [...header, row(1), row(2), row(3), row(4)].join('\n');
  const problems = checkPlan(plan({ tasks: four }), { specText: APPROVED_SPEC });
  assert.ok(problems.some((p) => /wave A has 4 tasks/.test(p)), problems.join('\n'));
});

test('the same file in tasks of different waves is fine', () => {
  // The default fixture puts parse.mjs in T1 (wave A) and T3 (wave B).
  assert.deepEqual(checkPlan(plan(), { specText: APPROVED_SPEC }), []);
});

test('a task with no files, or a Tasks section with no task table, is a problem', () => {
  const noFiles = [
    '| Task | Wave | Files it may change | ACs | First failing test |',
    '| --- | --- | --- | --- | --- |',
    '| T1 Parser | A |  | AC-1 | a |',
  ].join('\n');
  assert.ok(checkPlan(plan({ tasks: noFiles }), { specText: APPROVED_SPEC }).some((p) => /T1.*no files/.test(p)));
  assert.ok(checkPlan(plan({ tasks: 'We will do it in parts.' }), { specText: APPROVED_SPEC }).some((p) => /task table/.test(p)));
});

test('CRLF line endings are read the same', () => {
  assert.deepEqual(checkPlan(plan().replace(/\n/g, '\r\n'), { specText: APPROVED_SPEC.replace(/\n/g, '\r\n') }), []);
});

// Real run (lesson L-0015): the one real plan in the repository passes.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(new URL('./check.mjs', import.meta.url));

test('the existing /onboard plan passes, through the command line', () => {
  const run = spawnSync(process.execPath, [script, 'docs/specs/2026-10-11-onboard-plan.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /^ok: /);
});

test('the command line exits 1 and lists problems for a bad plan, and 2 without a path', () => {
  const usage = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(usage.status, 2);
  const missing = spawnSync(process.execPath, [script, 'docs/specs/no-such-plan.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout + missing.stderr, /no-such-plan/);
});

test('the onboard plan file is what the real-run test reads', () => {
  assert.match(readFileSync(`${ROOT}docs/specs/2026-10-11-onboard-plan.md`, 'utf8'), /classification: non-trivial/);
});
