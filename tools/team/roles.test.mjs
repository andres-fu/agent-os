// The team's role definitions (.claude/agents/*.md) follow one contract,
// docs/team/roles.md. Research behind it (2026-10-21, docs/team/roles.md):
// persona wording adds little; what helps is one job, an output contract,
// stop conditions, scope fences and least-privilege tools. This test keeps
// the role files from drifting back into persona prose and topic lists.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const AGENTS = fileURLToPath(new URL('../../.claude/agents/', import.meta.url));
const ROLES = ['developer', 'engineering-manager', 'principal-engineer', 'product-manager', 'qa', 'security-compliance', 'ux-reviewer'];
// Reviewers judge others' work: they never write files, and those whose
// verdict gates a merge read no untrusted web content (lesson L-0008).
const REVIEWERS = ['principal-engineer', 'security-compliance', 'ux-reviewer'];
const SECTIONS = ['## Mission', '## You own', '## Inputs', '## How you work', '## Output', '## Done when', '## Stop and escalate', '## Never', '## Hand-off'];
const WEB_TOOLS = ['WebSearch', 'WebFetch'];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

function load(name) {
  const text = readFileSync(join(AGENTS, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, `${name}: no frontmatter`);
  const meta = Object.fromEntries(
    match[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]),
  );
  const tools = (meta.tools ?? '').split(',').map((tool) => tool.trim()).filter(Boolean);
  return { meta, tools, body: match[2] };
}

test('the team is exactly the seven roles', () => {
  const files = readdirSync(AGENTS).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, ''));
  assert.deepEqual(files.sort(), [...ROLES].sort());
});

test('every role names itself, says when to use it, lists its tools and picks a model', () => {
  for (const name of ROLES) {
    const { meta, tools } = load(name);
    assert.equal(meta.name, name, name);
    assert.ok((meta.description ?? '').length >= 40, `${name}: description too short to route on`);
    assert.ok(tools.length > 0, `${name}: tools must be an explicit allowlist`);
  }
});

test('every role has the full contract, in order', () => {
  for (const name of ROLES) {
    const { body } = load(name);
    let at = -1;
    for (const section of SECTIONS) {
      const next = body.indexOf(`\n${section}\n`);
      assert.ok(next > at, `${name}: missing or out of order: ${section}`);
      at = next;
    }
  }
});

test('every role knows its end states and the team oath', () => {
  for (const name of ROLES) {
    const { body } = load(name);
    for (const word of ['DONE', 'BLOCKED', 'ESCALATE']) {
      assert.match(body, new RegExp(`\\b${word}\\b`), `${name}: no ${word} end state`);
    }
    assert.match(body, /docs\/team\/roles\.md/, `${name}: does not point at the team contract`);
  }
});

test('reviewers never write files and never read the web', () => {
  for (const name of REVIEWERS) {
    const { tools } = load(name);
    for (const tool of [...WRITE_TOOLS, ...WEB_TOOLS]) {
      assert.ok(!tools.includes(tool), `${name}: must not have ${tool}`);
    }
  }
});

// Standard procedures live in skills, preloaded through the `skills:` list in a
// role's frontmatter (Claude Code injects the skill's full content at start).
function preloads(name) {
  const text = readFileSync(join(AGENTS, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  const list = text.match(/^skills:\n((?:\s+- .+\n)+)/m);
  return list ? list[1].split('\n').map((line) => line.replace(/^\s+- /, '').trim()).filter(Boolean) : [];
}

// Each procedure skill, the roles that preload it, and the checker its output
// must pass. Roles without a procedure skill preload nothing yet.
const PROCEDURES = {
  plan: { roles: ['engineering-manager'], checker: 'node tools/plan/check.mjs' },
  spec: { roles: ['product-manager'], checker: 'node tools/spec/check.mjs' },
  review: { roles: ['principal-engineer', 'security-compliance'], checker: 'node tools/review/check-review.mjs' },
};

test('each role preloads exactly its procedure skills', () => {
  for (const name of ROLES) {
    const expected = Object.keys(PROCEDURES).filter((skill) => PROCEDURES[skill].roles.includes(name));
    assert.deepEqual(preloads(name), expected, name);
  }
});

test('each procedure skill exists, can be preloaded, names its checker, and pre-approves no writes', () => {
  for (const [name, { checker }] of Object.entries(PROCEDURES)) {
    const skill = readFileSync(fileURLToPath(new URL(`../../.claude/skills/${name}/SKILL.md`, import.meta.url)), 'utf8');
    assert.match(skill, new RegExp(`^name: ${name}$`, 'm'), name);
    assert.ok(skill.includes(checker), `${name}: does not name ${checker}`);
    assert.doesNotMatch(skill, /^disable-model-invocation: true$/m, `${name}: disable-model-invocation can't be preloaded`);
    // allowed-tools skips permission prompts for whoever runs the skill, so it
    // pre-approves reading and the checker only, never writes (security review of #38).
    const allowed = (skill.match(/^allowed-tools:(.*)$/m)?.[1] ?? '').split(',').map((tool) => tool.trim());
    for (const tool of ['Write', 'Edit', 'NotebookEdit']) {
      assert.ok(!allowed.includes(tool), `/${name} pre-approves ${tool}`);
    }
  }
});

test('no role can start other agents', () => {
  for (const name of ROLES) {
    assert.ok(!load(name).tools.includes('Agent'), `${name}: must not have Agent`);
  }
});

test('Opus only for writing specs and plans; Sonnet for everyone else (CLAUDE.md, Cost)', () => {
  for (const name of ROLES) {
    const expected = ['product-manager', 'engineering-manager'].includes(name) ? 'opus' : 'sonnet';
    assert.equal(load(name).meta.model, expected, name);
  }
});

test('roles are contracts, not costumes: no persona flattery, and short', () => {
  for (const name of ROLES) {
    const { body } = load(name);
    assert.doesNotMatch(body, /\b(world-class|expert in|seasoned|10x|rockstar|ninja|guru)\b/i, `${name}: persona flattery`);
    assert.ok(body.split('\n').length <= 110, `${name}: over 110 lines; keep it a contract, not a topic list`);
  }
});
