import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRecord } from './record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(HERE, '../../.claude/skills/onboard/intake-template.md'), 'utf8');
const RECORD_CLI = join(HERE, 'record.mjs');
const DECISION = 'docs/decisions/2026-10-12-data.md';

const open = () => ({ blocked: false });
const blocked = () => ({ blocked: true, decision: null, reason: 'no decision recorded: run /escalate' });

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'record-'));
  mkdirSync(join(root, '.claude/skills/onboard'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/onboard/intake-template.md'), TEMPLATE);
  return root;
}
const cleanup = (...dirs) => dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
const intakePath = (root) => join(root, 'docs/project/intake.md');
const read = (root) => readFileSync(intakePath(root), 'utf8');

function run(root, argv, { stdin = '', gate = open } = {}) {
  return runRecord(argv, { root, stdin, gate });
}
function runRecordTemplateIntake() {
  const scratch = makeRoot();
  try {
    assert.equal(run(scratch, ['create']).code, 0);
    return read(scratch);
  } finally {
    cleanup(scratch);
  }
}
function created() {
  const root = makeRoot();
  assert.equal(run(root, ['create']).code, 0);
  return root;
}

test('create writes the intake once and refuses to overwrite it', () => {
  const root = makeRoot();
  try {
    const first = run(root, ['create']);
    assert.equal(first.code, 0);
    assert.ok(existsSync(intakePath(root)));
    const before = read(root);
    assert.equal(run(root, ['create']).code, 1);
    assert.equal(read(root), before);
  } finally {
    cleanup(root);
  }
});

test('usage errors exit 2', () => {
  const root = created();
  try {
    assert.equal(run(root, []).code, 2);
    assert.equal(run(root, ['nope']).code, 2);
    assert.equal(run(root, ['record']).code, 2);
    assert.equal(run(root, ['record', 'Q9'], { stdin: 'x' }).code, 2);
    assert.equal(run(root, ['record', 'Q1', '--bogus'], { stdin: 'x' }).code, 2);
    assert.equal(run(root, ['record', 'Q1', '--data', 'names'], { stdin: 'x' }).code, 2);
    assert.equal(run(root, ['record', 'Q1', '--confirm', 'yes'], { stdin: 'x' }).code, 2);
    assert.equal(run(root, ['record', 'setup', '--confirm', 'maybe']).code, 2);
    assert.equal(run(root, ['record', 'Q1']).code, 2, 'no answer given');
  } finally {
    cleanup(root);
  }
});

test('record without an intake exits 1', () => {
  const root = makeRoot();
  try {
    assert.equal(run(root, ['record', 'Q1'], { stdin: 'a' }).code, 1);
  } finally {
    cleanup(root);
  }
});

test('answers come on stdin; the same answer again is byte-identical and says unchanged', () => {
  const root = created();
  try {
    const first = run(root, ['record', 'Q1'], { stdin: 'I write made-up reports.\n' });
    assert.equal(first.code, 0);
    const once = read(root);
    assert.match(once, /Answer: I write made-up reports\./);
    const again = run(root, ['record', 'Q1'], { stdin: 'I write made-up reports.\n' });
    assert.equal(again.code, 0);
    assert.match(again.out, /unchanged/);
    assert.equal(read(root), once);
  } finally {
    cleanup(root);
  }
});

test('stdin may be a function that is read only when needed', () => {
  const root = created();
  try {
    let reads = 0;
    const stdin = () => (reads++, 'from a function');
    assert.equal(runRecord(['record', 'Q1', '--root', root], { stdin, gate: open }).code, 0);
    assert.equal(reads, 1);
    assert.equal(runRecord(['record', 'Q2', '--dont-know', '--root', root], { stdin, gate: open }).code, 0);
    assert.equal(reads, 1, '--dont-know does not read stdin');
  } finally {
    cleanup(root);
  }
});

test('--dont-know stores dont-know; CRLF intake behaves like LF', () => {
  const root = created();
  try {
    assert.equal(run(root, ['record', 'Q2', '--dont-know']).code, 0);
    assert.match(read(root), /Answer: dont-know/);
    const lf = read(root);
    writeFileSync(intakePath(root), lf.replace(/\n/g, '\r\n'));
    assert.equal(run(root, ['record', 'Q2', '--dont-know']).code, 0);
    assert.equal(read(root), lf.replace(/\n/g, '\r\n'));
    assert.equal(run(root, ['record', 'Q3'], { stdin: 'Faster.' }).code, 0);
    const crlf = read(root);
    assert.ok(crlf.includes('\r\n') && !/[^\r]\n/.test(crlf));
  } finally {
    cleanup(root);
  }
});

test('--made-up marks the answer and a different answer clears it', () => {
  const root = created();
  try {
    run(root, ['record', 'Q5', '--made-up'], { stdin: 'Learner A, 2026-01-02' });
    assert.match(read(root), /Made up: yes/);
    run(root, ['record', 'Q5'], { stdin: 'Learner B, 2026-01-03' });
    assert.doesNotMatch(read(root), /Made up: yes/);
  } finally {
    cleanup(root);
  }
});

test('Q6 takes --data and --decision; bad ids and paths exit 1', () => {
  const root = created();
  try {
    assert.equal(run(root, ['record', 'Q6', '--data', 'names,school'], { stdin: '' }).code, 0);
    assert.match(read(root), /- \[x\] names/);
    assert.match(read(root), /- \[x\] school/);
    assert.equal(run(root, ['record', 'Q6', '--decision', DECISION], { stdin: '' }).code, 0);
    assert.ok(read(root).includes(`Decision: ${DECISION}`));
    assert.equal(run(root, ['record', 'Q6', '--data', 'bogus'], { stdin: '' }).code, 1);
    assert.equal(run(root, ['record', 'Q6', '--decision', '../x.md'], { stdin: '' }).code, 1);
    assert.equal(run(root, ['record', 'Q6', '--dont-know']).code, 0);
    assert.match(read(root), /- \[x\] dont-know/);
  } finally {
    cleanup(root);
  }
});

test('none ticked with a category word in the Q6 text is invalid', () => {
  const root = created();
  try {
    const result = run(root, ['record', 'Q6', '--data', 'none'], { stdin: 'It has pupil names in it.' });
    assert.equal(result.code, 1);
    assert.doesNotMatch(read(root), /- \[x\] none/);
    assert.equal(run(root, ['record', 'Q6', '--data', 'none'], { stdin: 'Only lesson ideas.' }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('the data flags block is recorded', () => {
  const root = created();
  try {
    const result = run(root, ['record', 'flags'], { stdin: 'Student-records rules might apply. Check with the district.' });
    assert.equal(result.code, 0);
    assert.match(read(root), /Student-records rules might apply/);
    assert.equal(run(root, ['record', 'flags', '--dont-know']).code, 2);
  } finally {
    cleanup(root);
  }
});

test('setup takes a summary on stdin and a --confirm value', () => {
  const root = created();
  try {
    assert.equal(run(root, ['record', 'setup'], { stdin: 'A shared document and a template.' }).code, 0);
    assert.equal(run(root, ['record', 'setup', '--confirm', 'yes']).code, 0);
    assert.match(read(root), /Confirmed: yes/);
    assert.equal(run(root, ['record', 'setup'], { stdin: 'A different plan.' }).code, 0);
    assert.doesNotMatch(read(root), /Confirmed: yes/);
  } finally {
    cleanup(root);
  }
});

test('record Q5 exits 3 with the status line while Q6 is open; Q6 is not recorded yet', () => {
  const root = created();
  try {
    const gate = () => ({ blocked: true, decision: null, reason: 'Q6 is not answered' });
    const before = read(root);
    const result = run(root, ['record', 'Q5'], { stdin: 'Learner A', gate });
    assert.equal(result.code, 3);
    assert.equal(result.out.split('\n')[0], 'BLOCKED: awaiting decision (Q6 is not answered)');
    assert.equal(read(root), before, 'nothing written');
  } finally {
    cleanup(root);
  }
});

test('record Q5 exits 3 when the gate blocks, naming the decision; allowed when it does not', () => {
  const root = created();
  try {
    run(root, ['record', 'Q6', '--data', 'children,names'], { stdin: '' });
    const gate = () => ({ blocked: true, decision: DECISION, reason: 'not on origin/main: run git fetch origin' });
    const result = run(root, ['record', 'Q5'], { stdin: 'Zed Example', gate });
    assert.equal(result.code, 3);
    assert.equal(
      result.out.split('\n')[0],
      `BLOCKED: awaiting decision ${DECISION} (not on origin/main: run git fetch origin)`,
    );
    assert.doesNotMatch(read(root), /Zed Example/);
    assert.equal(run(root, ['record', 'Q5'], { stdin: 'Zed Example', gate: open }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('the gate receives the parsed intake, and a throwing gate blocks', () => {
  const root = created();
  try {
    run(root, ['record', 'Q6', '--data', 'names'], { stdin: '' });
    let seen;
    run(root, ['record', 'Q5'], { stdin: 'x', gate: (intake) => ((seen = intake), { blocked: false }) });
    assert.equal(seen.questions.find((q) => q.id === 'Q6').data[0], 'names');
    const result = run(root, ['record', 'Q5'], { stdin: 'y', gate: () => { throw new Error('boom'); } });
    assert.equal(result.code, 3);
  } finally {
    cleanup(root);
  }
});

test('other questions are not held back by the gate', () => {
  const root = created();
  try {
    assert.equal(run(root, ['record', 'Q1'], { stdin: 'a', gate: blocked }).code, 0);
    assert.equal(run(root, ['record', 'Q6', '--data', 'children'], { stdin: '', gate: blocked }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('answers come on standard input only: --answer-file is refused', () => {
  const root = created();
  const outside = mkdtempSync(join(tmpdir(), 'answer-'));
  try {
    writeFileSync(join(outside, 'a.txt'), 'From a file outside.\n');
    const result = run(root, ['record', 'Q1', '--answer-file', join(outside, 'a.txt')]);
    assert.equal(result.code, 2);
    assert.doesNotMatch(read(root), /From a file outside/);
  } finally {
    cleanup(root, outside);
  }
});

test('record refuses to write through a symlinked docs/project', () => {
  const root = makeRoot();
  const elsewhere = mkdtempSync(join(tmpdir(), 'elsewhere-'));
  try {
    mkdirSync(join(elsewhere, 'project'));
    writeFileSync(join(elsewhere, 'project/intake.md'), runRecordTemplateIntake());
    mkdirSync(join(root, 'docs'));
    symlinkSync(join(elsewhere, 'project'), join(root, 'docs/project'));
    const before = readFileSync(join(elsewhere, 'project/intake.md'), 'utf8');
    const result = run(root, ['record', 'Q1'], { stdin: 'A made-up answer.' });
    assert.equal(result.code, 1);
    assert.equal(readFileSync(join(elsewhere, 'project/intake.md'), 'utf8'), before);
  } finally {
    cleanup(root, elsewhere);
  }
});

test('a symlinked intake is refused', () => {
  const root = created();
  const outside = mkdtempSync(join(tmpdir(), 'target-'));
  try {
    writeFileSync(join(outside, 'real.md'), read(root));
    rmSync(intakePath(root));
    symlinkSync(join(outside, 'real.md'), intakePath(root));
    assert.equal(run(root, ['record', 'Q1'], { stdin: 'x' }).code, 1);
    assert.doesNotMatch(readFileSync(join(outside, 'real.md'), 'utf8'), /Answer: x/);
  } finally {
    cleanup(root, outside);
  }
});

test('an intake value starting with :: is never printed', () => {
  const root = created();
  try {
    const hostile = '::error::owned';
    const results = [
      run(root, ['record', 'Q1'], { stdin: hostile }),
      run(root, ['record', 'Q1'], { stdin: hostile }),
      run(root, ['record', 'Q6', '--data', 'none'], { stdin: '::error::names' }),
      run(root, ['record', 'Q6', '--decision', '::error::x']),
      run(root, ['record', 'Q5'], { stdin: hostile, gate: () => ({ blocked: true, decision: '::error::bad', reason: '::error::why' }) }),
    ];
    // An invalid intake whose frontmatter and a block carry the text.
    writeFileSync(intakePath(root), read(root).replace('<!-- /onboard:Q2 -->', '::error::owned'));
    results.push(run(root, ['record', 'Q2'], { stdin: 'fine' }));
    for (const r of results) {
      assert.doesNotMatch(r.out + r.err, /::/);
      assert.doesNotMatch(r.out + r.err, /owned/);
    }
    assert.equal(results.at(-1).code, 1);
  } finally {
    cleanup(root);
  }
});

test('the CLI reads stdin, exits with the code, and prints to the right stream', () => {
  const root = makeRoot();
  try {
    const create = spawnSync('node', [RECORD_CLI, 'create', '--root', root], { encoding: 'utf8' });
    assert.equal(create.status, 0, create.stderr);
    const rec = spawnSync('node', [RECORD_CLI, 'record', 'Q1', '--root', root], { input: 'Made-up work.\n', encoding: 'utf8' });
    assert.equal(rec.status, 0, rec.stderr);
    assert.match(read(root), /Answer: Made-up work\./);
    const bad = spawnSync('node', [RECORD_CLI, 'wat', '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.ok(bad.stderr.length > 0);
    // Q5 with Q6 open: the real gate runs and blocks.
    const q5 = spawnSync('node', [RECORD_CLI, 'record', 'Q5', '--root', root], { input: 'Learner A', encoding: 'utf8' });
    assert.equal(q5.status, 3);
    assert.equal(q5.stdout.split('\n')[0], 'BLOCKED: awaiting decision (Q6 is not answered)');
  } finally {
    cleanup(root);
  }
});
