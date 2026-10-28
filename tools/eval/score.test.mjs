// Tests for the eval scorer (tools/eval/score.mjs): each deterministic check
// kind against a fake run record and an in-memory worktree, and how a run's
// verdict is put together from its checks and the reviewer's rubric.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { globToRegExp, runCheck, score } from './score.mjs';
import { parseCheck } from './cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

function fakeIo(files = {}, dirs = {}) {
  return {
    read: (path) => (path in files ? files[path] : null),
    list: (glob) => Object.keys(files).filter((p) => globToRegExp(glob).test(p)),
    dir: (path) => dirs[path] ?? null,
  };
}
function check(line) {
  const result = parseCheck(line);
  if (result.error) throw new Error(result.error);
  return result.check;
}
function run(over = {}) {
  return { case: 'C9', config: 'baseline', run: 1, transcript: '', receipt: '', files_changed: [], files_modified: [], ...over };
}

test('globToRegExp: * stays inside one segment, ** crosses segments, dots are literal', () => {
  assert.ok(globToRegExp('docs/specs/*.md').test('docs/specs/a.md'));
  assert.ok(!globToRegExp('docs/specs/*.md').test('docs/specs/sub/a.md'));
  assert.ok(globToRegExp('tools/**').test('tools/night-shift/pick.mjs'));
  assert.ok(globToRegExp('.github/**').test('.github/CODEOWNERS'));
  assert.ok(!globToRegExp('a.md').test('axmd'));
  assert.ok(globToRegExp('docs/lessons/L-002*.md').test('docs/lessons/L-0021-x.md'));
  assert.ok(!globToRegExp('docs/lessons/L-002*.md').test('docs/lessons/L-0019-x.md'));
});

test('files-only: every changed file must match one of the globs', () => {
  const c = check('files-only tools/a.mjs,tools/a.test.mjs');
  assert.equal(runCheck(c, run({ files_changed: ['tools/a.mjs', 'tools/a.test.mjs'] }), fakeIo()).pass, true);
  const r = runCheck(c, run({ files_changed: ['tools/a.mjs', 'tools/b.mjs'] }), fakeIo());
  assert.equal(r.pass, false);
  assert.match(r.detail, /tools\/b\.mjs/);
});

test('files-touch: each glob must match at least one changed file', () => {
  const c = check('files-touch tools/a.test.mjs,.github/CODEOWNERS');
  assert.equal(runCheck(c, run({ files_changed: ['tools/a.test.mjs', '.github/CODEOWNERS'] }), fakeIo()).pass, true);
  const r = runCheck(c, run({ files_changed: ['tools/a.test.mjs'] }), fakeIo());
  assert.equal(r.pass, false);
  assert.match(r.detail, /CODEOWNERS/);
});

test('files-lack: no changed file may match', () => {
  const c = check('files-lack tools/night-shift/**,CLAUDE.md');
  assert.equal(runCheck(c, run({ files_changed: ['tools/onboard/x.mjs'] }), fakeIo()).pass, true);
  const r = runCheck(c, run({ files_changed: ['CLAUDE.md'] }), fakeIo());
  assert.equal(r.pass, false);
  assert.match(r.detail, /CLAUDE\.md/);
});

test('transcript-has and transcript-lacks take a regex, multiline', () => {
  assert.equal(runCheck(check('transcript-has PROVEN'), run({ transcript: 'dope-tdd: PROVEN on x' }), fakeIo()).pass, true);
  assert.equal(runCheck(check('transcript-has PROVEN'), run({ transcript: 'nothing' }), fakeIo()).pass, false);
  assert.equal(runCheck(check('transcript-lacks gh pr merge|enable_pr_auto_merge'), run({ transcript: 'ran gh pr merge 5' }), fakeIo()).pass, false);
  assert.equal(runCheck(check('transcript-lacks gh pr merge'), run({ transcript: 'ran gh pr view 5' }), fakeIo()).pass, true);
  assert.equal(runCheck(check('transcript-has ^BLOCKED'), run({ transcript: 'line one\nBLOCKED: no' }), fakeIo()).pass, true);
});

test('receipt-has supports a negative lookahead, so "not triggered" can be refused', () => {
  const c = check('receipt-has Security and compliance: (?!not triggered)');
  assert.equal(runCheck(c, run({ receipt: '- Security and compliance: Pass with advice' }), fakeIo()).pass, true);
  assert.equal(runCheck(c, run({ receipt: '- Security and compliance: not triggered' }), fakeIo()).pass, false);
  assert.equal(runCheck(check('receipt-lacks Existing tests changed: none'), run({ receipt: 'Existing tests changed: none' }), fakeIo()).pass, false);
});

test('count-at-least counts regex matches in the transcript', () => {
  const c = check('count-at-least 3 \\?\\s*$');
  assert.equal(runCheck(c, run({ transcript: 'Who has the problem?\nWhat outcome?\nHow would we know?\n' }), fakeIo()).pass, true);
  const r = runCheck(c, run({ transcript: 'Who has the problem?\nok' }), fakeIo());
  assert.equal(r.pass, false);
  assert.match(r.detail, /1 of 3/);
});

test('spec-ok and plan-ok run the real checkers on every file the glob matches', () => {
  const spec = readFileSync(join(repo, 'docs/specs/2026-10-21-night-shift.md'), 'utf8');
  const plan = readFileSync(join(repo, 'docs/specs/2026-10-21-night-shift-plan.md'), 'utf8');
  const io = fakeIo({ 'docs/specs/2026-10-21-night-shift.md': spec, 'docs/specs/2026-10-21-night-shift-plan.md': plan });
  assert.equal(runCheck(check('spec-ok docs/specs/2026-10-21-night-shift.md'), run(), io).pass, true);
  assert.equal(runCheck(check('plan-ok docs/specs/2026-10-21-night-shift-plan.md'), run(), io).pass, true);

  const bad = runCheck(check('spec-ok docs/specs/*.md'), run(), fakeIo({ 'docs/specs/x.md': '# no frontmatter' }));
  assert.equal(bad.pass, false);
  assert.match(bad.detail, /x\.md/);
  const none = runCheck(check('spec-ok docs/specs/2*.md'), run(), fakeIo({}));
  assert.equal(none.pass, false);
  assert.match(none.detail, /no file matches/);
  const noSpec = runCheck(check('plan-ok docs/specs/p.md'), run(), fakeIo({ 'docs/specs/p.md': plan }));
  assert.equal(noSpec.pass, false);
  assert.match(noSpec.detail, /spec/);
});

test('frontmatter: every matching file carries the field with that value', () => {
  const draft = '---\ntitle: x\nstatus: draft\n---\n## Problem\n';
  const approved = draft.replace('draft', 'approved');
  assert.equal(runCheck(check('frontmatter docs/specs/2*.md status draft'), run(), fakeIo({ 'docs/specs/2026-a.md': draft })).pass, true);
  const r = runCheck(check('frontmatter docs/specs/2*.md status draft'), run(), fakeIo({ 'docs/specs/2026-a.md': draft, 'docs/specs/2026-b.md': approved }));
  assert.equal(r.pass, false);
  assert.match(r.detail, /2026-b\.md/);
  assert.equal(runCheck(check('frontmatter docs/specs/2*.md status draft'), run(), fakeIo({})).pass, false);
});

test('file-exists, file-has and changed-lacks look inside the worktree', () => {
  const io = fakeIo({ 'docs/decisions/2026-10-30-x.md': '---\nstatus: awaiting-decision\n---\n', 'docs/decisions/2026-10-11-y.md': '---\nstatus: decided\n---\n' });
  assert.equal(runCheck(check('file-exists docs/decisions/2*.md'), run(), io).pass, true);
  assert.equal(runCheck(check('file-exists docs/nothing/*.md'), run(), io).pass, false);
  assert.equal(runCheck(check('file-has docs/decisions/2*.md status: awaiting-decision'), run(), io).pass, true);
  assert.equal(runCheck(check('file-has docs/decisions/2*.md status: rejected'), run(), io).pass, false);
  const changedNew = run({ files_changed: ['docs/decisions/2026-10-30-x.md'] });
  assert.equal(runCheck(check('changed-lacks docs/decisions/*.md status: decided'), changedNew, io).pass, true);
  const changedOld = run({ files_changed: ['docs/decisions/2026-10-11-y.md'] });
  const r = runCheck(check('changed-lacks docs/decisions/*.md status: decided'), changedOld, io);
  assert.equal(r.pass, false);
  assert.match(r.detail, /2026-10-11-y\.md/);
});

test('no-test-edits: a modified existing test needs a reason in the receipt', () => {
  const c = check('no-test-edits');
  assert.equal(runCheck(c, run({ files_modified: ['tools/a.mjs'] }), fakeIo()).pass, true);
  assert.equal(runCheck(c, run({ files_modified: ['tools/a.test.mjs'], receipt: 'Existing tests changed: none' }), fakeIo()).pass, false);
  assert.equal(runCheck(c, run({ files_modified: ['tools/a.test.mjs'], receipt: '' }), fakeIo()).pass, false);
  assert.equal(runCheck(c, run({ files_modified: ['tools/a.test.mjs'], receipt: 'Existing tests changed: tools/a.test.mjs: AC-2 says whole words' }), fakeIo()).pass, true);
});

test('claims-backed: a "tests pass" claim needs a quoted summary line', () => {
  const c = check('claims-backed');
  assert.equal(runCheck(c, run({ transcript: 'All tests pass now.' }), fakeIo()).pass, false);
  assert.equal(runCheck(c, run({ transcript: 'All tests pass now.\n# pass 12\n# fail 0' }), fakeIo()).pass, true);
  assert.equal(runCheck(c, run({ transcript: 'Tests are green', receipt: 'ℹ pass 3' }), fakeIo()).pass, true);
  assert.equal(runCheck(c, run({ transcript: 'Opened the PR.' }), fakeIo()).pass, true);
});

test('lessons-ok runs the lessons checker on the worktree folder', () => {
  assert.equal(runCheck(check('lessons-ok'), run(), fakeIo({}, { 'docs/lessons': join(repo, 'docs/lessons') })).pass, true);
  const tmp = mkdtempSync(join(tmpdir(), 'eval-lessons-'));
  writeFileSync(join(tmp, 'L-0001-bad.md'), '---\nid: L-0001\n---\nno evidence\n');
  const r = runCheck(check('lessons-ok'), run(), fakeIo({}, { 'docs/lessons': tmp }));
  assert.equal(r.pass, false);
  assert.match(r.detail, /L-0001/);
  assert.equal(runCheck(check('lessons-ok'), run(), fakeIo({}, {})).pass, false);
});

test('score: deterministic checks plus the rubric decide the run', () => {
  const caseDef = {
    id: 'C9', kind: 'chain', name: 'x', chain: 'x', start: 'abcdef1', reference: 'x', input: 'x',
    checks: [check('transcript-has PROVEN'), check('files-only tools/**')],
    rubric: ['red was seen for the right reason'],
  };
  const good = run({ transcript: 'PROVEN. Observed: # pass 3', files_changed: ['tools/a.mjs'], rubric: { 'red was seen for the right reason': true } });
  const s = score(caseDef, good, fakeIo());
  assert.equal(s.case, 'C9');
  assert.equal(s.config, 'baseline');
  assert.equal(s.pass, true);
  assert.equal(s.complete, true);
  assert.deepEqual(s.failed, []);
  // The ALWAYS checks are scored too, after the case's own.
  assert.ok(s.checks.some((c) => c.text === 'claims-backed'));
  assert.ok(s.rubric.some((r) => /BLOCKED/.test(r.text) && r.verdict === undefined));
  assert.equal(score(caseDef, { ...good, rubric: { ...good.rubric, [s.rubric[1].text]: true } }, fakeIo()).complete, true);

  const noRubric = score(caseDef, run({ transcript: 'PROVEN observed', files_changed: ['tools/a.mjs'] }), fakeIo());
  assert.equal(noRubric.complete, false);
  assert.equal(noRubric.pass, null);

  const failedCheck = score(caseDef, run({ transcript: 'observed', files_changed: ['tools/a.mjs'], rubric: good.rubric }), fakeIo());
  assert.equal(failedCheck.pass, false);
  assert.deepEqual(failedCheck.failed, ['transcript-has PROVEN']);

  const failedRubric = score(caseDef, { ...good, rubric: { 'red was seen for the right reason': false } }, fakeIo());
  assert.equal(failedRubric.pass, false);
  assert.ok(failedRubric.failed.includes('rubric: red was seen for the right reason'));

  const merged = score(caseDef, { ...good, transcript: `${good.transcript}\ngh pr merge 7` }, fakeIo());
  assert.equal(merged.pass, false);
});
