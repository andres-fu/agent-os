// The agents' GitHub identity: a GitHub App installation token, minted on the
// stakeholder's machine (docs/decisions/2026-10-21-public-repo-and-night-shift.md,
// option D). No test touches the network: fetch is always a fake.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createJwt,
  isFresh,
  mintToken,
  getToken,
  credentialResponse,
  sessionEnvLine,
  readConfig,
} from './token.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const home = mkdtempSync(join(tmpdir(), 'github-app-'));
after(() => rmSync(home, { recursive: true, force: true }));

const NOW = 1_800_000_000; // seconds

function decode(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { status, json: async () => body };
  };
}

test('the JWT is RS256, issued by the App, backdated 60s and valid under 10 minutes', () => {
  const jwt = createJwt({ appId: '123', privateKey, now: NOW });
  const [header, payload, signature] = jwt.split('.');
  assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(decode(payload), { iat: NOW - 60, exp: NOW + 540, iss: '123' });
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${payload}`);
  assert.equal(verify.verify(createPublicKey(privateKey), Buffer.from(signature, 'base64url')), true);
});

test('a cached token is reused only while more than five minutes are left', () => {
  const at = (seconds) => new Date((NOW + seconds) * 1000).toISOString();
  assert.equal(isFresh({ token: 't', expires_at: at(301) }, NOW), true);
  assert.equal(isFresh({ token: 't', expires_at: at(300) }, NOW), false);
  assert.equal(isFresh({ token: 't', expires_at: 'not a date' }, NOW), false);
  assert.equal(isFresh(null, NOW), false);
  assert.equal(isFresh({ expires_at: at(3000) }, NOW), false);
});

test('minting posts to the installation with the JWT and returns the token and expiry', async () => {
  const calls = [];
  const fetch = fakeFetch(201, { token: 'ghs_abc', expires_at: '2027-01-15T09:00:00Z', permissions: {} }, calls);
  const result = await mintToken({ appId: '123', installationId: '456', privateKey, fetch, now: NOW });
  assert.deepEqual(result, { token: 'ghs_abc', expires_at: '2027-01-15T09:00:00Z' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/app/installations/456/access_tokens');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(calls[0].init.headers.Accept, 'application/vnd.github+json');
  // The token asks for only these, so it stays capped even if the App is
  // later granted more.
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    permissions: { contents: 'write', issues: 'write', pull_requests: 'write' },
  });
});

test('a mint response that is not JSON is an error that quotes none of it', async () => {
  const fetch = async () => ({
    status: 201,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON: <html>secret-page</html>');
    },
  });
  await assert.rejects(mintToken({ appId: '123', installationId: '456', privateKey, fetch, now: NOW }), (error) => {
    assert.match(error.message, /not JSON/);
    assert.doesNotMatch(error.message, /secret-page/);
    return true;
  });
});

test('a refused mint is an error naming the status, never echoing the response or key', async () => {
  const fetch = fakeFetch(401, { message: 'A JSON web token could not be decoded' });
  await assert.rejects(
    mintToken({ appId: '123', installationId: '456', privateKey, fetch, now: NOW }),
    (error) => {
      assert.match(error.message, /401/);
      assert.doesNotMatch(error.message, /PRIVATE KEY|decoded/);
      return true;
    },
  );
});

test('a mint response without a token is an error', async () => {
  const fetch = fakeFetch(201, { expires_at: '2027-01-15T09:00:00Z' });
  await assert.rejects(mintToken({ appId: '123', installationId: '456', privateKey, fetch, now: NOW }), /no token/);
});

test('the config needs numeric App and installation ids and a key path', () => {
  const dir = mkdtempSync(join(home, 'config-'));
  const write = (value) => writeFileSync(join(dir, 'github-app.json'), JSON.stringify(value));
  write({ appId: '123', installationId: '456', privateKeyPath: 'k.pem' });
  assert.deepEqual(readConfig(dir), { appId: '123', installationId: '456', privateKeyPath: join(dir, 'k.pem') });
  write({ appId: 123, installationId: 456, privateKeyPath: '/abs/k.pem' });
  assert.equal(readConfig(dir).appId, '123');
  for (const bad of [
    { appId: 'x', installationId: '456', privateKeyPath: 'k.pem' },
    { appId: '123', installationId: '', privateKeyPath: 'k.pem' },
    { appId: '123', installationId: '456' },
  ]) {
    write(bad);
    assert.throws(() => readConfig(dir), /github-app\.json/, JSON.stringify(bad));
  }
  rmSync(join(dir, 'github-app.json'));
  assert.throws(() => readConfig(dir), /github-app\.json/);
});

test('getToken reuses a fresh cache, and mints and caches when it is stale', async () => {
  const dir = mkdtempSync(join(home, 'get-'));
  writeFileSync(join(dir, 'app.pem'), privateKey);
  writeFileSync(join(dir, 'github-app.json'), JSON.stringify({ appId: '1', installationId: '2', privateKeyPath: 'app.pem' }));
  const later = new Date((NOW + 3600) * 1000).toISOString();

  const calls = [];
  const fetch = fakeFetch(201, { token: 'ghs_new', expires_at: later }, calls);
  assert.equal(await getToken({ home: dir, fetch, now: NOW }), 'ghs_new');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'token-cache.json'), 'utf8')), { token: 'ghs_new', expires_at: later });

  assert.equal(await getToken({ home: dir, fetch, now: NOW + 60 }), 'ghs_new');
  assert.equal(calls.length, 1, 'a fresh cache is reused');

  assert.equal(await getToken({ home: dir, fetch, now: NOW + 3400 }), 'ghs_new');
  assert.equal(calls.length, 2, 'a cache with under five minutes left is replaced');
});

test('git gets the token for github.com over https, and nothing for any other host', () => {
  assert.equal(
    credentialResponse('protocol=https\nhost=github.com\n\n', 'ghs_abc'),
    'username=x-access-token\npassword=ghs_abc\n',
  );
  assert.equal(credentialResponse('protocol=https\r\nhost=github.com\r\n', 'ghs_abc'), 'username=x-access-token\npassword=ghs_abc\n');
  assert.equal(credentialResponse('protocol=https\nhost=gitlab.com\n', 'ghs_abc'), '');
  assert.equal(credentialResponse('protocol=http\nhost=github.com\n', 'ghs_abc'), '');
  assert.equal(credentialResponse('protocol=https\nhost=github.com.evil.example\n', 'ghs_abc'), '');
});

test('the session line sets GH_TOKEN, and fails closed when there is no token', () => {
  assert.equal(sessionEnvLine('ghs_abc'), 'GH_TOKEN=ghs_abc\n');
  // A missing or odd token must never leave GH_TOKEN unset: gh would fall back
  // to the stakeholder's own stored login.
  assert.equal(sessionEnvLine(null), 'GH_TOKEN=unavailable\n');
  assert.equal(sessionEnvLine(''), 'GH_TOKEN=unavailable\n');
  assert.equal(sessionEnvLine('ghs_a b'), 'GH_TOKEN=unavailable\n');
});

// End to end: the script as git and the SessionStart hook run it. A fresh
// cache or a missing config means no network call is ever attempted.
const script = fileURLToPath(new URL('./token.mjs', import.meta.url));
function run(args, { agentHome, input = '', envFile } = {}) {
  const env = { ...process.env, AGENT_OS_HOME: agentHome };
  delete env.CLAUDE_ENV_FILE;
  if (envFile) env.CLAUDE_ENV_FILE = envFile;
  return spawnSync(process.execPath, [script, ...args], { input, env, encoding: 'utf8' });
}
const cached = mkdtempSync(join(home, 'cli-'));
writeFileSync(join(cached, 'token-cache.json'), JSON.stringify({ token: 'ghs_cached', expires_at: '2099-01-01T00:00:00Z' }));
const empty = mkdtempSync(join(home, 'cli-empty-'));

test('credential get answers git with the cached token', () => {
  const result = run(['credential', 'get'], { agentHome: cached, input: 'protocol=https\nhost=github.com\n\n' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'username=x-access-token\npassword=ghs_cached\n');
});

test('credential store and erase do nothing', () => {
  for (const action of ['store', 'erase']) {
    const result = run(['credential', action], { agentHome: cached, input: 'protocol=https\nhost=github.com\n' });
    assert.equal(result.status, 0, action);
    assert.equal(result.stdout, '', action);
  }
});

test('credential get gives git nothing when there is no App config', () => {
  const result = run(['credential', 'get'], { agentHome: empty, input: 'protocol=https\nhost=github.com\n\n' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /github-app\.json/);
});

test('session-env writes "unavailable" first, then the token, so a crash or timeout in between still fails closed', () => {
  const envFile = join(home, 'env-file');
  writeFileSync(envFile, 'EXISTING=1\n');
  assert.equal(run(['session-env'], { agentHome: cached, envFile }).status, 0);
  assert.equal(readFileSync(envFile, 'utf8'), 'EXISTING=1\nGH_TOKEN=unavailable\nGH_TOKEN=ghs_cached\n');
});

test('session-env leaves only "unavailable" when it cannot mint', () => {
  const envFile = join(home, 'env-file-empty');
  writeFileSync(envFile, '');
  assert.equal(run(['session-env'], { agentHome: empty, envFile }).status, 0);
  assert.equal(readFileSync(envFile, 'utf8'), 'GH_TOKEN=unavailable\n');
});

test('session-env exits 0 and says so when the env file cannot be written', () => {
  const result = run(['session-env'], { agentHome: cached, envFile: join(home, 'no-such-dir', 'env') });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /could not write/);
});

test('an unknown command is a usage error', () => {
  const result = run(['print'], { agentHome: cached });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /usage/);
});

test('nothing is written to the cache when minting fails', async () => {
  const dir = mkdtempSync(join(home, 'fail-'));
  writeFileSync(join(dir, 'app.pem'), privateKey);
  writeFileSync(join(dir, 'github-app.json'), JSON.stringify({ appId: '1', installationId: '2', privateKeyPath: 'app.pem' }));
  await assert.rejects(getToken({ home: dir, fetch: fakeFetch(500, {}), now: NOW }), /500/);
  assert.equal(existsSync(join(dir, 'token-cache.json')), false);
});
