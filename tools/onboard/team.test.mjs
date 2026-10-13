// Tests for the team diagram (AC-13): Mermaid and text both name everyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderTeam, readRoles } from './team.mjs';

const ROLES = [
  'developer',
  'engineering-manager',
  'principal-engineer',
  'product-manager',
  'qa',
  'security-compliance',
  'ux-reviewer',
];

function fixtureDir(files) {
  const root = mkdtempSync(join(tmpdir(), 'team-'));
  const dir = join(root, 'agents');
  mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return { root, dir };
}

const agent = (name) => `---\nname: ${name}\ndescription: x\n---\nBody\n`;

function parts(out) {
  const m = /```mermaid\n([\s\S]*?)```/.exec(out);
  assert.ok(m, 'has a mermaid block');
  return { mermaid: m[1], text: out.slice(m.index + m[0].length) };
}

test('Mermaid and text both name every role in a fixture agents dir', () => {
  const files = Object.fromEntries(ROLES.map((r) => [`${r}.md`, agent(r)]));
  const { root, dir } = fixtureDir(files);
  try {
    const roles = readRoles(dir);
    assert.deepEqual(roles, ROLES);
    const { mermaid, text } = parts(renderTeam({ roles }));
    assert.match(mermaid, /^flowchart /);
    for (const r of ROLES) {
      assert.ok(mermaid.includes(r), `mermaid names ${r}`);
      assert.ok(text.includes(r), `text names ${r}`);
    }
    for (const who of ['the person with the problem', 'the stakeholder']) {
      assert.ok(mermaid.includes(who), `mermaid names ${who}`);
      assert.ok(text.includes(who), `text names ${who}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the text version is numbered and shows the real flow', () => {
  const { text } = parts(renderTeam({ roles: ROLES }));
  const lines = text.split('\n').filter((l) => /^\d+\. /.test(l));
  assert.ok(lines.length >= 5);
  lines.forEach((l, i) => assert.ok(l.startsWith(`${i + 1}. `)));
  assert.match(text, /the person with the problem.*product-manager/s);
  assert.match(text, /product-manager.*engineering-manager.*developer.*qa/s);
  assert.match(text, /principal-engineer/);
  assert.match(text, /security-compliance/);
  assert.match(text, /ux-reviewer[^\n]*advis/i);
  assert.match(text, /the stakeholder[^\n]*(decid|merge)/i);
});

test('Mermaid edges follow the flow', () => {
  const { mermaid } = parts(renderTeam({ roles: ROLES }));
  const edge = (a, b) => new RegExp(`\\b${a}\\b[^\\n]*-->[^\\n]*\\b${b}\\b`).test(mermaid);
  assert.ok(edge('person', 'product_manager'));
  assert.ok(edge('product_manager', 'engineering_manager'));
  assert.ok(edge('engineering_manager', 'developer'));
  assert.ok(edge('developer', 'qa'));
});

test('an extra role is still named in both versions, with a safe node id', () => {
  const { mermaid, text } = parts(renderTeam({ roles: [...ROLES, 'data-wrangler'] }));
  assert.ok(mermaid.includes('data-wrangler'));
  assert.ok(text.includes('data-wrangler'));
  assert.match(mermaid, /\bdata_wrangler\[/);
});

test('hostile role names cannot break the Mermaid block or the ids', () => {
  const evil = 'x"];\n```\n::error::pwn';
  const out = renderTeam({ roles: [evil] });
  const { mermaid } = parts(out);
  assert.equal((out.match(/```/g) ?? []).length, 2);
  for (const id of mermaid.matchAll(/^\s*([^\s\[\]()-]+)[\[(]/gm)) {
    assert.match(id[1], /^[a-z0-9_]+$/);
  }
  assert.ok(!out.includes('::error'));
});

test('no real names appear', () => {
  const out = renderTeam({ roles: ROLES });
  assert.ok(!/Andres|Fuentes|@/.test(out));
});

test('readRoles skips files without a name and never throws on a bad file', () => {
  const { root, dir } = fixtureDir({
    'b.md': agent('beta'),
    'a.md': agent('alpha'),
    'noname.md': '---\ndescription: x\n---\n',
    'nofront.md': 'just text\n',
    'broken.md': '---\nname: [unclosed\n',
    'notes.txt': agent('ignored'),
  });
  mkdirSync(join(dir, 'sub.md'));
  try {
    assert.deepEqual(readRoles(dir), ['alpha', 'beta']);
    assert.deepEqual(readRoles(join(root, 'missing')), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renderTeam rejects bad input with a fixed error', () => {
  assert.throws(() => renderTeam({ roles: 'qa' }), /roles must be a list/);
  assert.throws(() => renderTeam(), /roles must be a list/);
});
