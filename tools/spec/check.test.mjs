// The /spec skill's checker: a spec has the template's frontmatter and
// sections, every acceptance criterion reads "Given ..., then ...", the five
// non-functional areas are named, and an approved spec says who approved it.
// The format follows docs/specs/_template.md and the specs already merged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkSpec } from './check.mjs';

function spec({ front = {}, sections = {} } = {}) {
  const fields = { title: 'x', status: 'draft', owner: 'product-manager', date: '2026-10-21', ...front };
  const frontmatter = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const body = {
    Problem: 'Who has it, with evidence.',
    Goal: 'One sentence.',
    'Acceptance criteria': '- [ ] Given a file, when it is read, then it parses.\n- [ ] Given no file, then it reports "missing".',
    'Non-functional requirements': '- **Security:** none.\n- **Cost:** none.\n- **Performance:** none.\n- **Accessibility:** n/a.\n- **Privacy and data:** none.',
    'Out of scope': 'Nothing.',
    'Open questions': 'None.',
    ...sections,
  };
  const text = Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([heading, value]) => `## ${heading}\n${value}\n`)
    .join('\n');
  return `---\n${frontmatter}\n---\n\n${text}`;
}

test('a complete draft spec has no problems', () => {
  assert.deepEqual(checkSpec(spec()), []);
});

test('each required frontmatter field is named when missing or wrong', () => {
  for (const field of ['title', 'status', 'owner', 'date']) {
    const problems = checkSpec(spec({ front: { [field]: undefined } }));
    assert.ok(problems.some((p) => p.includes(field)), `${field}: ${problems.join(' | ')}`);
  }
  assert.ok(checkSpec(spec({ front: { status: 'ready' } })).some((p) => /status/.test(p)));
  assert.ok(checkSpec(spec({ front: { owner: 'developer' } })).some((p) => /owner/.test(p)));
});

test('a status with a trailing comment is read as its first word', () => {
  assert.deepEqual(checkSpec(spec({ front: { status: 'draft        # draft | approved | done.' } })), []);
});

test('an approved spec must say who approved it', () => {
  const problems = checkSpec(spec({ front: { status: 'approved' } }));
  assert.ok(problems.some((p) => /approved_by/.test(p)), problems.join('\n'));
  assert.deepEqual(checkSpec(spec({ front: { status: 'approved', approved_by: 'the stakeholder, 2026-10-21: "yes"' } })), []);
});

test('each required section is named when missing; Open questions may be gone once resolved', () => {
  for (const heading of ['Problem', 'Goal', 'Acceptance criteria', 'Non-functional requirements', 'Out of scope']) {
    const problems = checkSpec(spec({ sections: { [heading]: undefined } }));
    assert.ok(problems.some((p) => p.includes(heading)), `${heading}: ${problems.join(' | ')}`);
  }
  assert.deepEqual(checkSpec(spec({ sections: { 'Open questions': undefined } })), []);
});

test('Out of scope may carry a note in its heading', () => {
  const text = spec({ sections: { 'Out of scope': undefined } }) + '\n## Out of scope (v2 or later)\nLater.\n';
  assert.deepEqual(checkSpec(text), []);
});

test('every acceptance criterion reads Given ..., then ...', () => {
  const problems = checkSpec(spec({ sections: { 'Acceptance criteria': '- [ ] Given a file, then it parses.\n- [ ] The script is fast.\n- [ ] Given a big file.' } }));
  assert.equal(problems.filter((p) => /Given \.\.\., then/.test(p)).length, 2, problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('The script is fast')));
});

test('a lone criterion on the first line under its heading is still checked', () => {
  const problems = checkSpec(spec({ sections: { 'Acceptance criteria': '- [ ] The script is fast.' } }));
  assert.ok(problems.some((p) => p.includes('The script is fast')), problems.join('\n'));
});

test('a criterion may span several lines and sub-bullets', () => {
  const ac = '- [ ] AC-1: Given `SKILL.md`,\n  then:\n  - it names Q1;\n  - it names Q2.\n- [x] Given done work, then it is ticked.';
  assert.deepEqual(checkSpec(spec({ sections: { 'Acceptance criteria': ac } })), []);
});

test('a spec with no acceptance criteria is a problem', () => {
  const problems = checkSpec(spec({ sections: { 'Acceptance criteria': 'Each one testable.' } }));
  assert.ok(problems.some((p) => /no acceptance criteria/.test(p)), problems.join('\n'));
});

test('the five non-functional areas are each named', () => {
  for (const area of ['Security', 'Cost', 'Performance', 'Accessibility', 'Privacy']) {
    const nfr = ['Security', 'Cost', 'Performance', 'Accessibility', 'Privacy and data']
      .filter((name) => !name.startsWith(area))
      .map((name) => `- **${name}:** x.`)
      .join('\n');
    const problems = checkSpec(spec({ sections: { 'Non-functional requirements': nfr } }));
    assert.ok(problems.some((p) => p.includes(area)), `${area}: ${problems.join(' | ')}`);
  }
});

test('CRLF line endings are read the same', () => {
  assert.deepEqual(checkSpec(spec().replace(/\n/g, '\r\n')), []);
});

// The gate: every spec in docs/specs/ passes, so the CI tests job refuses a PR
// with a malformed spec. The product manager writes specs but has no shell, by
// design (it reads the web), so this test is where the checker really runs.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(new URL('./check.mjs', import.meta.url));
const SPECS = readdirSync(join(ROOT, 'docs/specs'))
  .filter((file) => file.endsWith('.md') && !file.startsWith('_') && !file.endsWith('-plan.md'))
  .map((file) => `docs/specs/${file}`);

test('there are specs to check', () => {
  assert.ok(SPECS.length >= 3, SPECS.join(', '));
});

test('every spec in docs/specs passes, through the command line', () => {
  for (const file of SPECS) {
    const run = spawnSync(process.execPath, [script, file], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 0, `${file}\n${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /^ok: /);
  }
});

test('the command line exits 2 without a path, and 1 for a missing file', () => {
  assert.equal(spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' }).status, 2);
  const missing = spawnSync(process.execPath, [script, 'docs/specs/none.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /none\.md/);
});
