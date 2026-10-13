// AC-15: the onboarding scripts import no network module (static scan), and
// their tests pass with the network switched off (deny-network.mjs hook).
// Literal regexes only: never new RegExp(variable).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ONBOARD = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(ONBOARD, '..', '..');
const HOOK = join(ONBOARD, 'test-support', 'deny-network.mjs');
const SELF = 'no-network.test.mjs';

const IMPORT_RE = /\b(?:from|import)\s*\(?\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads)(?:\/[\w/]*)?['"]/;
const REQUIRE_RE = /\brequire\s*\(\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads)(?:\/[\w/]*)?['"]/;
const CHILD_RE = /['"](?:node:)?child_process['"]/;
const FETCH_RE = /\bfetch\s*\(/;
const WS_RE = /\bWebSocket\b/;
const ES_RE = /\bEventSource\b/;

function listMjs(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listMjs(p));
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out.sort();
}

/** Scans every .mjs under dir; returns [{ file, problem }]. */
function scan(dir) {
  const problems = [];
  for (const file of listMjs(dir)) {
    const rel = relative(dir, file).split(sep).join('/');
    // This file and the hook name the modules on purpose (fixtures, patches).
    if (rel === SELF || rel.startsWith('test-support/')) continue;
    const text = readFileSync(file, 'utf8');
    const isTest = rel.endsWith('.test.mjs');
    const childAllowed = isTest || rel === 'git-main.mjs';
    for (const line of text.split('\n')) {
      if (CHILD_RE.test(line) && (IMPORT_RE.test(line) || REQUIRE_RE.test(line)) && childAllowed) continue;
      if (IMPORT_RE.test(line)) problems.push({ file: rel, problem: 'network/process import: ' + line.trim() });
      else if (REQUIRE_RE.test(line)) problems.push({ file: rel, problem: 'network/process require: ' + line.trim() });
      if (FETCH_RE.test(line)) problems.push({ file: rel, problem: 'fetch(' });
      if (WS_RE.test(line)) problems.push({ file: rel, problem: 'WebSocket' });
      if (ES_RE.test(line)) problems.push({ file: rel, problem: 'EventSource' });
    }
  }
  return problems;
}

function withFixture(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nonet-'));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('scanner: a fixture importing node:https fails the scan', () => {
  withFixture({ 'bad.mjs': "import https from 'node:https';\nexport default https;\n" }, (dir) => {
    const found = scan(dir);
    assert.equal(found.length, 1);
    assert.equal(found[0].file, 'bad.mjs');
  });
});

test('scanner: catches each forbidden form', () => {
  const bad = {
    'a.mjs': "import x from 'http';\n",
    'b.mjs': "import { connect } from 'node:net';\n",
    'c.mjs': "import 'tls';\n",
    'd.mjs': "const d = require('node:dgram');\n",
    'e.mjs': "const m = await import('node:dns');\n",
    'f.mjs': "import p from 'dns/promises';\n",
    'g.mjs': "import w from 'worker_threads';\n",
    'h.mjs': "import h from 'node:http2';\n",
    'i.mjs': "await fetch('x');\n",
    'j.mjs': "new WebSocket('x');\n",
    'k.mjs': "new EventSource('x');\n",
    'l.mjs': "import { spawn } from 'node:child_process';\n",
    'm.mjs': "const c = require('child_process');\n",
  };
  withFixture(bad, (dir) => {
    const files = new Set(scan(dir).map((p) => p.file));
    for (const name of Object.keys(bad)) assert.ok(files.has(name), name + ' not caught');
  });
});

test('scanner: allows child_process in test files and clean code', () => {
  withFixture(
    { 'x.test.mjs': "import { spawnSync } from 'node:child_process';\n", 'ok.mjs': "import { readFileSync } from 'node:fs';\n" },
    (dir) => assert.deepEqual(scan(dir), []),
  );
  withFixture({ 'other.mjs': "import { execFileSync } from 'node:child_process';\n" }, (dir) =>
    assert.equal(scan(dir).length, 1),
  );
});

test('onboarding scripts import no network module', () => {
  assert.deepEqual(scan(ONBOARD), []);
});

test('git-main.mjs imports only execFileSync, uses array args, never sets shell', () => {
  const text = readFileSync(join(ONBOARD, 'git-main.mjs'), 'utf8');
  const imports = text.match(/import\s*\{[^}]*\}\s*from\s*['"](?:node:)?child_process['"]/g) ?? [];
  assert.equal(imports.length, 1);
  assert.match(imports[0], /^import\s*\{\s*execFileSync\s*\}/);
  assert.equal(/import\s+[\w*]/.test(text.replace(/import\s*\{/g, '')), false, 'no default or namespace import');
  const calls = text.match(/execFileSync\(/g) ?? [];
  assert.ok(calls.length >= 1);
  assert.equal(calls.length, (text.match(/execFileSync\(\s*'git'\s*,\s*\[/g) ?? []).length, 'array args');
  assert.equal(/\bshell\b/.test(text.replace(/\/\/.*$/gm, '')), false, 'shell is never set');
});

function runNode(args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
}

test('deny hook: fetch rejects, socket connect, dns.lookup throw; git still runs', () => {
  const code = `
    const net = await import('node:net');
    const dns = await import('node:dns');
    const cp = await import('node:child_process');
    const out = {};
    try { await fetch('https://example.com'); out.fetch = 'allowed'; } catch (e) { out.fetch = e.message; }
    try { new net.Socket().connect(80, '127.0.0.1'); out.net = 'allowed'; } catch (e) { out.net = e.message; }
    try { dns.lookup('example.com', () => {}); out.dns = 'allowed'; } catch (e) { out.dns = e.message; }
    try { await dns.promises.lookup('example.com'); out.dnsp = 'allowed'; } catch (e) { out.dnsp = e.message; }
    out.git = cp.execFileSync('git', ['--version'], { encoding: 'utf8' }).startsWith('git version');
    console.log(JSON.stringify(out));`;
  const r = runNode(['--import', HOOK, '--input-type=module', '-e', code]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  for (const k of ['fetch', 'net', 'dns', 'dnsp']) assert.match(out[k], /network disabled/, k);
  assert.equal(out.git, true);
});

test('onboard tests pass with the network denied', () => {
  const files = listMjs(ONBOARD)
    .filter((f) => f.endsWith('.test.mjs') && !f.endsWith(SELF))
    .map((f) => relative(ROOT, f));
  assert.ok(files.length > 0);
  const r = runNode(['--test', '--import', HOOK, ...files]);
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-1000));
});
