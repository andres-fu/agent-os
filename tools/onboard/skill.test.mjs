// AC-1, AC-3 and AC-4 (skill half), checked on the files themselves:
// .claude/skills/onboard/SKILL.md and .claude/skills/onboard/intake-template.md.
// Convention in SKILL.md: a line starting with "> " is text the person sees.
// The privacy warning is exempt from the word list (it is the template's
// fixed text, and is not a question).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASK_ORDER, PRIVACY_WARNING, hasWord } from './intake.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const skill = read('../../.claude/skills/onboard/SKILL.md');
const template = read('../../.claude/skills/onboard/intake-template.md');

const BANNED = [
  'dependency', 'stack', 'repository', 'CI', 'deploy', 'test command', 'API', 'database',
  'server', 'PII', 'compliance', 'personal data',
];
const hit = (text, term) => hasWord(text, term);

const frontmatter = (() => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  assert.ok(m, 'SKILL.md has frontmatter');
  return Object.fromEntries(
    m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  );
})();
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '');
const personLines = body.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2));
const flat = body.replace(/\s+/g, ' ');

// Sections are "## Ask <id>" headings, in the order the skill asks.
const sectionIds = [...body.matchAll(/^## Ask (\w+)$/gm)].map((m) => m[1]);
function section(id) {
  const start = body.indexOf(`## Ask ${id}\n`);
  assert.ok(start !== -1, `section Ask ${id} exists`);
  const next = body.indexOf('\n## ', start + 1);
  return body.slice(start, next === -1 ? undefined : next);
}

// ---- AC-1 -------------------------------------------------------------------

test('frontmatter: name onboard, a description, model sonnet', () => {
  assert.equal(frontmatter.name, 'onboard');
  assert.ok(frontmatter.description && frontmatter.description.length > 20);
  assert.equal(frontmatter.model, 'sonnet');
  assert.match(flat, /Sonnet/);
});

test('allowed-tools names the two onboard scripts exactly, not a wildcard path', () => {
  const tools = frontmatter['allowed-tools'].split(/,\s*/);
  assert.deepEqual(tools, [
    'Read', 'Glob', 'Grep',
    'Bash(node tools/onboard/record.mjs:*)', 'Bash(node tools/onboard/check.mjs:*)',
    'Agent',
  ]);
});

test('the agent tool is for security-compliance only, as an instruction not enforced', () => {
  assert.match(flat, /Agent tool[^.]*only[^.]*`?security-compliance`?/i);
  assert.match(flat, /instruction[^.]*not enforced|not enforced[^.]*instruction/i);
});

test('states the cap: 8 questions plus one confirmation', () => {
  assert.match(flat, /8 questions/);
  assert.match(flat, /one (yes\/no )?confirmation/i);
});

test('refers to no path outside the repository (L-0005)', () => {
  assert.doesNotMatch(skill, /(^|[\s`(="'])~[\\/]/m, 'home directory');
  assert.doesNotMatch(skill, /\.\.[\\/]/, 'parent directory');
  assert.doesNotMatch(skill, /(^|[\s`(="'])\/(home|Users|tmp|etc|var|root|opt|usr|mnt)\b/m, 'absolute path');
  assert.doesNotMatch(skill, /\b[A-Za-z]:\\/, 'drive path');
  assert.doesNotMatch(skill, /\$HOME|%USERPROFILE%/);
});

test('credits AIS-OS with a link and the MIT license', () => {
  assert.match(skill, /\[AIS-OS\]\(https:\/\/github\.com\/nateherkai\/AIS-OS\)/);
  assert.match(flat, /MIT/);
  assert.match(flat, /Nate Herk/);
});

test('contains none of the AIS-OS framework names', () => {
  for (const term of ['Three Ms', 'Default Shift', 'Mindset framework']) {
    assert.ok(!skill.toLowerCase().includes(term.toLowerCase()), term);
  }
});

test('nothing the person sees uses a banned word, the privacy warning included', () => {
  assert.ok(personLines.length >= 10, 'person-facing lines are marked with "> "');
  for (const line of personLines) {
    for (const term of BANNED) assert.ok(!hit(line, term), `"${term}" in: ${line}`);
  }
  for (const term of BANNED) assert.ok(!hit(PRIVACY_WARNING, term), `"${term}" in the privacy warning`);
});

// ---- ask order and privacy warning (AC-3) -----------------------------------

test('sections follow ASK_ORDER', () => {
  assert.deepEqual(sectionIds, ASK_ORDER);
});

test('the privacy warning comes before Q1, Q6 and Q5 in the skill', () => {
  for (const id of ['Q1', 'Q6', 'Q5']) {
    const s = section(id);
    const warning = s.indexOf(PRIVACY_WARNING);
    const ask = s.indexOf('Ask:');
    assert.ok(warning !== -1, `${id} has the warning`);
    assert.ok(ask !== -1 && warning < ask, `${id}: warning before the question`);
  }
  for (const id of ['Q2', 'Q3', 'Q4', 'Q7', 'Q8']) {
    assert.ok(!section(id).includes(PRIVACY_WARNING), `${id} does not repeat it`);
  }
});

test('the privacy warning comes before Q1, Q6 and Q5 in the template', () => {
  const at = (needle) => template.indexOf(needle);
  const warnings = [];
  for (let i = template.indexOf(PRIVACY_WARNING); i !== -1; i = template.indexOf(PRIVACY_WARNING, i + 1)) warnings.push(i);
  for (const id of ['Q1', 'Q6', 'Q5']) {
    const start = at(`<!-- onboard:${id} part=`);
    const before = warnings.filter((w) => w < start);
    assert.ok(before.length > 0, `${id} has a warning before it`);
    const gap = template.slice(before.at(-1) + PRIVACY_WARNING.length, start);
    assert.ok(!/<!-- onboard:/.test(gap), `${id}: no other block between warning and question`);
  }
});

test('Q6 names every category, in the template', () => {
  const q6 = /### Q6\. (.*)/.exec(template)[1];
  for (const phrase of [
    'names', 'birthdates', 'ID numbers', 'diagnoses', 'test scores',
    'disability or special-education details', 'children', 'health', 'mental health',
    'family', 'school', 'payment details',
  ]) {
    assert.ok(q6.includes(phrase), phrase);
  }
});

test('the skill warns, in plain words, that the intake is kept and readable by anyone who can see the project', () => {
  for (const text of [flat, template]) {
    assert.match(text, /saved in the project for good/);
    assert.match(text, /anyone who can see the project can read it/);
  }
});

test('the skill asks Q6 before Q5 and says why', () => {
  assert.ok(sectionIds.indexOf('Q6') < sectionIds.indexOf('Q5'));
  assert.match(flat, /Q6 before Q5/);
});

// ---- AC-4 -------------------------------------------------------------------

test('one question at a time, each answer saved before the next', () => {
  assert.match(flat, /one question at a time/i);
  assert.match(flat, /save[^.]*(straight away|before)[^.]*(next|asking)/i);
  assert.match(flat, /node tools\/onboard\/record\.mjs record/);
  assert.match(flat, /stdin/i);
});

test('never asks a Setup question: shows a plain-English summary to confirm', () => {
  assert.match(flat, /never ask[^.]*Setup question/i);
  assert.match(flat, /summary[^.]*confirm/i);
  assert.match(flat, /record\.mjs record setup[^.]*--confirm/);
  assert.match(flat, /observed[^.]*inferred|inferred[^.]*observed/i);
});

test('considers existing or no-code tools', () => {
  assert.match(flat, /existing[^.]*no-code|no-code[^.]*existing/i);
});

test('never says compliant, never asks for secrets, never fetches web content, never merges', () => {
  assert.match(flat, /never say[^.]*"compliant"/i);
  assert.match(flat, /never ask[^.]*(secret|password|key)/i);
  assert.match(flat, /never (fetch|open|read)[^.]*web/i);
  assert.match(flat, /never merge/i);
  assert.match(flat, /might apply/i);
});

// ---- the stop, the flags, the closing screen (plan T1.5 notes) --------------

test('status runs after Q6 and the skill stops before Q5 when blocked', () => {
  const q6 = section('Q6');
  assert.match(q6, /node tools\/onboard\/check\.mjs status/);
  assert.match(q6, /BLOCKED/);
  assert.match(q6, /(stop|do not ask)[^.]*Q5/i);
  assert.match(q6, /\/escalate/);
  assert.match(q6, /onboard_covers/);
  assert.match(q6, /onboard_outcome/);
  assert.match(q6, /--decision/);
  assert.ok(q6.indexOf('check.mjs status') < q6.indexOf('/escalate'));
  assert.match(q6, /plain (words|language)/i);
});

test('security-compliance maps Q6 and the flags are recorded as might-apply', () => {
  const q6 = section('Q6');
  assert.match(q6, /security-compliance/);
  assert.match(q6, /record\.mjs record flags/);
  assert.match(q6, /might apply/i);
  assert.match(q6, /check with (their|your) organisation/i);
});

test('reads CLAUDE.md and AGENTS.md first, and pre-fills only what the repo supports', () => {
  assert.match(flat, /CLAUDE\.md/);
  assert.match(flat, /AGENTS\.md/);
  assert.match(flat, /cit(e|ing)/i);
});

test('creates the intake and re-runs by skipping answered questions', () => {
  assert.match(flat, /record\.mjs create/);
  assert.match(flat, /check\.mjs status/);
  assert.match(flat, /skip[^.]*answered/i);
});

test('closing screen is at most 5 lines and covers written files, the PR and the next step', () => {
  const m = /## Closing screen\n([\s\S]*?)(\n## |$)/.exec(body);
  assert.ok(m, 'a Closing screen section');
  const lines = m[1].split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2));
  assert.ok(lines.length >= 3 && lines.length <= 5, `${lines.length} lines`);
  const text = lines.join(' ');
  assert.match(text, /docs\/project\/intake\.md/);
  assert.match(text, /stakeholder/);
  assert.match(text, /pull request|PR/);
  assert.match(text, /not available yet/i);
  assert.match(text, /PR 2/);
  assert.match(text, /backlog/);
  assert.match(text, /diagram/);
});

test('no secrets, no web: the skill says so and does not use web tools', () => {
  assert.doesNotMatch(frontmatter['allowed-tools'], /Web/i);
  assert.match(flat, /no web|never (fetch|open)[^.]*web/i);
});

test('the person is told the intake may be public, and that real names never go in', () => {
  assert.match(flat, /made-up|made up/i);
});

test('the pull request is for the stakeholder to merge, not the agent', () => {
  assert.match(flat, /stakeholder[^.]*merge/i);
});

test('a personal-details Note from status is passed on in plain words, and does not stop the interview', () => {
  assert.match(flat, /If status shows a line starting `Note:`/);
  assert.ok(personLines.some((l) => /real names or details only where your organisation allows/.test(l)));
  assert.ok(personLines.some((l) => /never type them here/.test(l)));
});
