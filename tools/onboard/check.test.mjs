import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck, intakeStatus, validateProject, statusLines } from './check.mjs';
import { runRecord } from './record.mjs';
import { parseIntake, recordAnswer, SECTION_MARKERS } from './intake.mjs';
import { dataGate, HIGHLY_SENSITIVE_CATEGORIES } from './data-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(HERE, '../../.claude/skills/onboard/intake-template.md'), 'utf8');
const CHECK_CLI = join(HERE, 'check.mjs');
const DECISION = 'docs/decisions/2026-10-12-data.md';

const noMain = () => ({ found: false });
const mainWith = (text) => (path) => (path === DECISION && text !== undefined ? { found: true, text } : { found: false });
const decisionText = (covers, { status = 'decided', outcome = 'build' } = {}) =>
  `---\ntitle: Data\nstatus: ${status}\nonboard_outcome: ${outcome}\nonboard_covers: ${covers}\n---\nBody\n`;

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'check-'));
  mkdirSync(join(root, '.claude/skills/onboard'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/onboard/intake-template.md'), TEMPLATE);
  return root;
}
const cleanup = (...dirs) => dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
const intakePath = (root) => join(root, 'docs/project/intake.md');
const readIntake = (root) => readFileSync(intakePath(root), 'utf8');
const gateFor = (readMain) => (intake) => dataGate(intake, { readMain });

function rec(root, argv, stdin = '') {
  const r = runRecord(argv, { root, stdin, gate: () => ({ blocked: false }) });
  assert.ok(r.code === 0, `record ${argv.join(' ')} -> ${r.code} ${r.err}`);
}
function newIntake(root) {
  rec(root, ['create']);
}
function answer(root, id, text, ...flags) {
  rec(root, ['record', id, ...flags], text);
}
const status = (root, readMain = noMain, extra = []) => runCheck(['status', '--root', root, ...extra], { readMain });
const validate = (root, extra = []) => runCheck(['validate', '--root', root, ...extra], { readMain: noMain });

// ---- status ---------------------------------------------------------------

test('Q1-Q3 answered: exit 3, line 1 is BLOCKED, then Q4 Q5 Q6 Q7 Q8 and Setup by part', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    for (const id of ['Q1', 'Q2', 'Q3']) answer(root, id, 'A made-up answer.');
    const r = status(root);
    assert.equal(r.code, 3);
    assert.equal(
      r.out,
      [
        'BLOCKED: awaiting decision (Q6 is not answered)',
        'Next: Q4',
        'Still open',
        '  Discovery: Q4, Q5',
        '  Data: Q6',
        '  Guardrails: Q7, Q8',
        '  Setup: confirmation',
        '',
      ].join('\n'),
    );
    assert.equal(r.err, '');
  } finally {
    cleanup(root);
  }
});

test('"don\'t know" answers are listed as follow-ups, not as open', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q1', 'x');
    answer(root, 'Q2', '', '--dont-know');
    answer(root, 'Q4', '', '--dont-know');
    const r = status(root);
    const lines = r.out.split('\n');
    const at = lines.indexOf('Follow-ups (answered "don\'t know")');
    assert.ok(at > 0, r.out);
    assert.deepEqual(lines.slice(at + 1, at + 2), ['  Discovery: Q2, Q4']);
    assert.doesNotMatch(lines.slice(0, at).join('\n'), /Q2|Q4/);
  } finally {
    cleanup(root);
  }
});

test('Q6 "don\'t know" blocks like a sensitive answer and still lists open questions (AC-17)', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    for (const id of ['Q1', 'Q2', 'Q3', 'Q4']) answer(root, id, 'x');
    answer(root, 'Q6', '', '--dont-know');
    const r = status(root);
    assert.equal(r.code, 3);
    const lines = r.out.split('\n');
    assert.equal(lines[0], 'BLOCKED: awaiting decision (no decision recorded: run /escalate)');
    assert.equal(lines[1], 'Next: none (raise /escalate before asking Q5)');
    assert.match(r.out, /Discovery: Q5/);
    assert.match(r.out, /Guardrails: Q7, Q8/);
    assert.match(r.out, /Follow-ups[^\n]*\n {2}Data: Q6/);
  } finally {
    cleanup(root);
  }
});

test('Next is never past Q6 while blocked, and is the first open id otherwise', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    assert.match(status(root).out, /^BLOCKED: awaiting decision \(Q6 is not answered\)\nNext: Q1\n/);
    for (const id of ['Q1', 'Q2', 'Q3', 'Q4']) answer(root, id, 'x');
    assert.match(status(root).out, /\nNext: Q6\n/);
    answer(root, 'Q6', '', '--data', 'none');
    assert.match(status(root).out, /^READY: no decision needed\nNext: Q5\n/);
  } finally {
    cleanup(root);
  }
});

test('each highly sensitive category, alone, is BLOCKED through the CLI', () => {
  for (const { category, options } of HIGHLY_SENSITIVE_CATEGORIES) {
    for (const option of options) {
      const root = makeRoot();
      try {
        newIntake(root);
        answer(root, 'Q6', '', '--data', option);
        const r = status(root);
        assert.equal(r.code, 3, `${category}/${option}`);
        assert.match(r.out.split('\n')[0], /^BLOCKED: awaiting decision /);
      } finally {
        cleanup(root);
      }
    }
  }
});

test('non-sensitive ticks are READY with no decision needed', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'names,school,family');
    const r = status(root);
    assert.equal(r.code, 0);
    assert.equal(r.out.split('\n')[0], 'READY: no decision needed');
  } finally {
    cleanup(root);
  }
});

test('personal details (names, birthdates, family, school) warn but never block (stakeholder, 2026-10-13)', () => {
  const NOTE = 'Note: this involves personal details. Use real ones only where your organisation allows, and never in this file.';
  for (const data of ['names', 'birthdates', 'family', 'school', 'names,school,family']) {
    const root = makeRoot();
    try {
      newIntake(root);
      answer(root, 'Q6', '', '--data', data);
      const r = status(root);
      assert.equal(r.code, 0, data);
      const lines = r.out.split('\n');
      assert.equal(lines[0], 'READY: no decision needed', data);
      assert.match(lines[1], /^Next: /, data);
      assert.equal(lines[2], NOTE, data);
      assert.equal(JSON.parse(status(root, noMain, ['--json']).out).note, NOTE, data);
    } finally {
      cleanup(root);
    }
  }
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'none');
    assert.doesNotMatch(status(root).out, /^Note:/m, 'no note without personal details');
    assert.equal(JSON.parse(status(root, noMain, ['--json']).out).note, null);
  } finally {
    cleanup(root);
  }
});

test('a decision on origin/main that says build makes it READY with the path', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'children,names', '--decision', DECISION);
    const r = status(root, mainWith(decisionText('children names')));
    assert.equal(r.code, 0);
    assert.equal(r.out.split('\n')[0], `READY: ${DECISION} says build`);
  } finally {
    cleanup(root);
  }
});

test('absent from origin/main stays blocked and says to fetch; do-not-build and undecided stay blocked', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'children', '--decision', DECISION);
    const cases = [
      [noMain, 'not on origin/main: run git fetch origin'],
      [mainWith(decisionText('children', { status: 'proposed' })), 'not decided yet'],
      [mainWith(decisionText('children', { outcome: 'do-not-build' })), 'decision is not to build'],
    ];
    for (const [readMain, reason] of cases) {
      const r = status(root, readMain);
      assert.equal(r.code, 3);
      assert.equal(r.out.split('\n')[0], `BLOCKED: awaiting decision ${DECISION} (${reason})`);
    }
  } finally {
    cleanup(root);
  }
});

test('a decision whose onboard_covers no longer matches Q6 blocks again', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'children', '--decision', DECISION);
    const main = mainWith(decisionText('children'));
    assert.equal(status(root, main).code, 0);
    answer(root, 'Q6', '', '--data', 'children,health');
    const r = status(root, main);
    assert.equal(r.code, 3);
    assert.equal(
      r.out.split('\n')[0],
      `BLOCKED: awaiting decision ${DECISION} (decision covers different Q6 answers)`,
    );
  } finally {
    cleanup(root);
  }
});

test('the real gate reads origin/main from a temp git repo, not the working copy', () => {
  const root = makeRoot();
  const git = (...a) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...a], { cwd: root, stdio: 'pipe' });
  try {
    git('init', '-q');
    newIntake(root);
    answer(root, 'Q6', '', '--data', 'payment', '--decision', DECISION);
    mkdirSync(join(root, 'docs/decisions'), { recursive: true });
    writeFileSync(join(root, DECISION), decisionText('payment'));
    const local = runCheck(['status', '--root', root], {});
    assert.equal(local.code, 3);
    assert.match(local.out, /not on origin\/main: run git fetch origin/);
    git('add', DECISION);
    git('commit', '-q', '-m', 'decision');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const merged = runCheck(['status', '--root', root], {});
    assert.equal(merged.code, 0, merged.out);
    assert.equal(merged.out.split('\n')[0], `READY: ${DECISION} says build`);
  } finally {
    cleanup(root);
  }
});

test('--json prints the same facts as the text', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q1', 'x');
    const r = status(root, noMain, ['--json']);
    assert.equal(r.code, 3);
    const body = JSON.parse(r.out);
    assert.equal(body.line, 'BLOCKED: awaiting decision (Q6 is not answered)');
    assert.equal(body.next, 'Q2');
    assert.deepEqual(body.open.Discovery, ['Q2', 'Q3', 'Q4', 'Q5']);
    assert.deepEqual(body.followUps.Discovery, []);
  } finally {
    cleanup(root);
  }
});

test('intakeStatus and statusLines work on a parsed intake', () => {
  const parsed = parseIntake(TEMPLATE);
  assert.ok(parsed.ok);
  const s = intakeStatus(parsed.value, { blocked: true, decision: null, reason: 'Q6 is not answered' });
  assert.equal(s.next, 'Q1');
  assert.deepEqual(Object.keys(s.open), ['Discovery', 'Data', 'Guardrails', 'Setup']);
  assert.deepEqual(s.open.Setup, ['confirmation']);
  assert.equal(statusLines(s)[0], 'BLOCKED: awaiting decision (Q6 is not answered)');
});

test('status line 1 never carries a reason or path the gate invented', () => {
  const parsed = parseIntake(TEMPLATE).value;
  const s = intakeStatus(parsed, { blocked: true, decision: '::error::x', reason: '::error::y' });
  assert.equal(statusLines(s)[0], 'BLOCKED: awaiting decision (blocked)');
});

test('an invalid or missing intake exits 1 with a fixed message', () => {
  const root = makeRoot();
  try {
    assert.equal(status(root).code, 1);
    newIntake(root);
    // none ticked, but the Q6 text names a data category
    const text = readIntake(root);
    const ticked = text.replace('- [ ] none', '- [x] none').replace(/(### Q6[^]*?\nAnswer:)/, '$1 pupil names');
    writeFileSync(intakePath(root), ticked);
    const r = status(root);
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out + r.err, /pupil/);
    writeFileSync(intakePath(root), ticked.replace('- [x] none', '- [ ] none').replace(/ pupil names/, ''));
    assert.equal(status(root).code, 3);
  } finally {
    cleanup(root);
  }
});

test('an intake value starting with :: is never printed by status or validate', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    const hostile = '::error::owned 2026-01-02 a@b.example';
    answer(root, 'Q1', hostile);
    answer(root, 'Q6', '::error::names', '--data', 'children', '--decision', DECISION);
    const outputs = [status(root), status(root, noMain, ['--json']), validate(root), validate(root, ['--strict']), validate(root, ['--json'])];
    // Break the intake so the parser fails, with the text in frontmatter and in a block.
    writeFileSync(intakePath(root), readIntake(root).replace('<!-- /onboard:Q2 -->', '::error::owned'));
    outputs.push(status(root), validate(root, ['--strict']));
    assert.equal(outputs.at(-2).code, 1);
    writeFileSync(join(root, 'docs/project/::error::name.md'), 'x');
    outputs.push(validate(root, ['--strict']));
    for (const r of outputs) {
      assert.doesNotMatch(r.out + r.err, /::/);
      assert.doesNotMatch(r.out + r.err, /owned|a@b/);
    }
  } finally {
    cleanup(root);
  }
});

// ---- validate -------------------------------------------------------------

test('no docs/project: exit 0, and no git is needed', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-empty-'));
  try {
    const r = validate(root, ['--strict']);
    assert.equal(r.code, 0);
    assert.deepEqual(validateProject(root, { strict: true }), { errors: [], warnings: [] });
  } finally {
    cleanup(root);
  }
});

test('--strict fails on an unmarked match, passes with Made up: yes, fails again after an edit', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q5', 'Learner A, born 2015-03-04, mail a.b@example.invalid');
    const loose = validate(root);
    assert.equal(loose.code, 0, 'without --strict a match only warns');
    assert.match(loose.out, /docs\/project\/intake\.md/);
    assert.match(loose.out, /Q5/);
    assert.match(loose.out, /email/);
    assert.match(loose.out, /date/);
    assert.doesNotMatch(loose.out, /example\.invalid|2015/);

    const strict = validate(root, ['--strict']);
    assert.equal(strict.code, 1);

    answer(root, 'Q5', 'Learner A, born 2015-03-04, mail a.b@example.invalid', '--made-up');
    assert.equal(validate(root, ['--strict']).code, 0);
    assert.deepEqual(validateProject(root, { strict: true }).warnings, []);

    answer(root, 'Q5', 'Learner B, born 2016-05-06');
    const edited = validate(root, ['--strict']);
    assert.equal(edited.code, 1);
    assert.deepEqual(validateProject(root, { strict: true }).warnings, [
      { file: 'docs/project/intake.md', question: 'Q5', kind: 'date' },
    ]);
  } finally {
    cleanup(root);
  }
});

test('every intake block is scanned: setup, flags and Q6 text', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'flags', 'Call 555-123-4567 about this.');
    rec(root, ['record', 'setup'], 'Contact x@y.example for the plan.');
    answer(root, 'Q6', 'Pupil 12345678 is included.', '--data', 'names');
    const { warnings } = validateProject(root, { strict: true });
    assert.deepEqual(
      warnings.map((w) => `${w.question}:${w.kind}`).sort(),
      ['Q6:id-number', 'flags:phone', 'setup:email'],
    );
  } finally {
    cleanup(root);
  }
});

test('a dated backlog line fails --strict; no Made up applies outside the intake', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    writeFileSync(join(root, 'docs/project/backlog.md'), '- [next] Send the weekly note.\n  Done when: the note is sent by 2026-11-01.\n');
    const r = validate(root, ['--strict']);
    assert.equal(r.code, 1);
    assert.match(r.out, /docs\/project\/backlog\.md/);
    assert.deepEqual(validateProject(root, { strict: true }).warnings, [
      { file: 'docs/project/backlog.md', question: null, kind: 'date' },
    ]);
    writeFileSync(join(root, 'docs/project/backlog.md'), '- [next] Send the weekly note.\n  Done when: made up: yes 2026-11-01.\n');
    assert.equal(validate(root, ['--strict']).code, 1);
  } finally {
    cleanup(root);
  }
});

test('every file under docs/project is scanned, recursively and of any type', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    mkdirSync(join(root, 'docs/project/deep/er'), { recursive: true });
    writeFileSync(join(root, 'docs/project/deep/er/data.csv'), 'name,mail\nA,a@b.example\n');
    writeFileSync(join(root, 'docs/project/deep/notes.txt'), 'phone +1 415 555 0100\n');
    writeFileSync(join(root, 'docs/project/blob.bin'), Buffer.from('id 99999999\n'));
    const files = validateProject(root, { strict: true }).warnings.map((w) => w.file).sort();
    assert.deepEqual(files, ['docs/project/blob.bin', 'docs/project/deep/er/data.csv', 'docs/project/deep/notes.txt']);
  } finally {
    cleanup(root);
  }
});

test('a symlink under docs/project is an error and is not followed', () => {
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), 'target-'));
  try {
    newIntake(root);
    writeFileSync(join(outside, 'secret.txt'), 'a@b.example\n');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'docs/project/link.txt'));
    mkdirSync(join(root, 'docs/project/sub'));
    symlinkSync(outside, join(root, 'docs/project/sub/dir'));
    const result = validateProject(root, { strict: false });
    assert.equal(result.errors.length, 2);
    assert.deepEqual(result.warnings, []);
    assert.ok(result.errors.some((e) => e.includes('docs/project/link.txt')));
    const cli = validate(root);
    assert.equal(cli.code, 1, 'an error fails even without --strict');
  } finally {
    cleanup(root, outside);
  }
});

test('file names in output are sanitised', () => {
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), 'target-'));
  try {
    newIntake(root);
    symlinkSync(outside, join(root, 'docs/project/a b:c'));
    const { errors } = validateProject(root, { strict: true });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^[^\n]*docs\/project\/a\?b\?c/);
    assert.doesNotMatch(errors[0], /[^A-Za-z0-9._/\-?:,() ']/);
  } finally {
    cleanup(root, outside);
  }
});

test('an invalid intake is an error', () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, 'docs/project'), { recursive: true });
    writeFileSync(intakePath(root), '# not an intake\n');
    assert.equal(validateProject(root, { strict: false }).errors.length, 1);
    assert.equal(validate(root).code, 1);
  } finally {
    cleanup(root);
  }
});

test('the CLAUDE.md onboard section is scanned, and nothing outside the markers', () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, 'CLAUDE.md'), 'Contact a@b.example here.\n');
    assert.equal(validate(root, ['--strict']).code, 0, 'outside the markers is not scanned');
    writeFileSync(
      join(root, 'CLAUDE.md'),
      `Before.\n${SECTION_MARKERS.start}\nSee the intake. Call 415-555-0100.\n${SECTION_MARKERS.end}\nAfter 2026-01-02.\n`,
    );
    const r = validate(root, ['--strict']);
    assert.equal(r.code, 1);
    assert.deepEqual(validateProject(root, { strict: true }).warnings, [
      { file: 'CLAUDE.md', question: null, kind: 'phone' },
    ]);
    writeFileSync(join(root, 'CLAUDE.md'), `${SECTION_MARKERS.start}\nonly a start\n`);
    assert.equal(validateProject(root, { strict: true }).errors.length, 1);
    // CRLF
    writeFileSync(join(root, 'CLAUDE.md'), `${SECTION_MARKERS.start}\r\nclean\r\n${SECTION_MARKERS.end}\r\n`);
    assert.equal(validate(root, ['--strict']).code, 0);
  } finally {
    cleanup(root);
  }
});

test('a symlinked CLAUDE.md is an error', () => {
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), 'target-'));
  try {
    writeFileSync(join(outside, 'c.md'), 'x');
    symlinkSync(join(outside, 'c.md'), join(root, 'CLAUDE.md'));
    assert.equal(validateProject(root, { strict: true }).errors.length, 1);
  } finally {
    cleanup(root, outside);
  }
});

test('--json prints errors and warnings', () => {
  const root = makeRoot();
  try {
    newIntake(root);
    answer(root, 'Q2', 'mail a@b.example');
    const r = validate(root, ['--json']);
    assert.deepEqual(JSON.parse(r.out).warnings, [{ file: 'docs/project/intake.md', question: 'Q2', kind: 'email' }]);
  } finally {
    cleanup(root);
  }
});

// ---- usage and exit codes -------------------------------------------------

test('usage errors exit 2', () => {
  const root = makeRoot();
  try {
    assert.equal(runCheck([], {}).code, 2);
    assert.equal(runCheck(['nope', '--root', root], {}).code, 2);
    assert.equal(runCheck(['status', '--bogus', '--root', root], {}).code, 2);
    assert.equal(runCheck(['status', '--strict', '--root', root], {}).code, 2);
    assert.equal(runCheck(['validate', '--root'], {}).code, 2);
  } finally {
    cleanup(root);
  }
});

test('the CLI exits 0, 1, 2 and 3', () => {
  const root = makeRoot();
  try {
    const cli = (...a) => spawnSync('node', [CHECK_CLI, ...a, '--root', root], { encoding: 'utf8' });
    assert.equal(cli('validate', '--strict').status, 0);
    assert.equal(cli('status').status, 1, 'no intake');
    newIntake(root);
    assert.equal(cli('status').status, 3);
    assert.equal(cli('bogus').status, 2);
    answer(root, 'Q6', '', '--data', 'none');
    assert.equal(cli('status').status, 0);
  } finally {
    cleanup(root);
  }
});
