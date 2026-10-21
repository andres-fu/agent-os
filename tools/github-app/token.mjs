// The agents' GitHub identity: a short-lived GitHub App installation token,
// so agents act as the App (agent-os-team[bot]) and never as the stakeholder.
// Decision: docs/decisions/2026-10-21-public-repo-and-night-shift.md, option D.
//
//   node tools/github-app/token.mjs session-env   # SessionStart hook: GH_TOKEN for gh
//   node tools/github-app/token.mjs credential get  # git credential helper: a fresh token per push
//
// Reads ~/.agent-os/github-app.json ({ appId, installationId, privateKeyPath })
// and caches the token in ~/.agent-os/token-cache.json until five minutes
// before it expires (GitHub issues them for an hour). AGENT_OS_HOME overrides
// the folder. No dependencies: Node 20+.
//
// It fails closed. session-env always sets GH_TOKEN, to "unavailable" when no
// token can be minted, because an unset GH_TOKEN makes gh fall back to the
// stakeholder's own stored login. Errors name the status, never the response
// body or the key.

import { createSign } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com';
const REFRESH_MARGIN_SECONDS = 300;
// Installation tokens start ghs_ and can be long and contain `.` and `-`
// (seen 2026-10-21: 383 characters; issue #24). Anything outside letters,
// digits, `_`, `.` and `-` is refused rather than written into an env file
// the shell reads or into git's credential input.
const TOKEN_RE = /^[A-Za-z0-9_.-]+$/;
const ID_RE = /^[0-9]+$/;
const TOKEN_PERMISSIONS = { contents: 'write', issues: 'write', pull_requests: 'write' };

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

/** A JWT the App signs to ask GitHub for an installation token. */
export function createJwt({ appId, privateKey, now }) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  // Backdated 60s for clock drift; GitHub allows at most 10 minutes.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

/** Whether a cached token has more than five minutes left. */
export function isFresh(cache, now) {
  if (!cache || typeof cache.token !== 'string' || !TOKEN_RE.test(cache.token)) return false;
  const expires = Date.parse(cache.expires_at) / 1000;
  return Number.isFinite(expires) && expires - now > REFRESH_MARGIN_SECONDS;
}

/** Asks GitHub for a new installation token. */
export async function mintToken({ appId, installationId, privateKey, fetch, now }) {
  const jwt = createJwt({ appId, privateKey, now });
  const response = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    // Ask for only what agents need, so the token stays capped even if the
    // App is later granted more.
    body: JSON.stringify({ permissions: TOKEN_PERMISSIONS }),
  });
  if (response.status !== 201) {
    throw new Error(`GitHub refused the installation token request (status ${response.status})`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    // A parse error can quote the body; say only that it was not JSON.
    throw new Error('GitHub answered with a body that is not JSON');
  }
  if (typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) {
    throw new Error('GitHub answered with no token');
  }
  return { token: body.token, expires_at: body.expires_at };
}

/** The App's ids and key path, from <home>/github-app.json. */
export function readConfig(home) {
  const file = join(home, 'github-app.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file}: missing or not JSON (see tools/github-app/README.md)`);
  }
  const appId = String(raw.appId ?? '');
  const installationId = String(raw.installationId ?? '');
  if (!ID_RE.test(appId) || !ID_RE.test(installationId) || typeof raw.privateKeyPath !== 'string' || raw.privateKeyPath === '') {
    throw new Error(`${file}: needs numeric appId and installationId, and privateKeyPath`);
  }
  const privateKeyPath = isAbsolute(raw.privateKeyPath) ? raw.privateKeyPath : join(home, raw.privateKeyPath);
  return { appId, installationId, privateKeyPath };
}

/** A token for the App: the cached one while fresh, else a new one, cached. */
export async function getToken({ home, fetch, now }) {
  const cacheFile = join(home, 'token-cache.json');
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (isFresh(cache, now)) return cache.token;
    } catch {
      // An unreadable cache is replaced below.
    }
  }
  const config = readConfig(home);
  const privateKey = readFileSync(config.privateKeyPath, 'utf8');
  const minted = await mintToken({ ...config, privateKey, fetch, now });
  writeFileSync(cacheFile, JSON.stringify(minted), { mode: 0o600 });
  return minted.token;
}

/** The git credential helper's answer: the token for https://github.com only. */
export function credentialResponse(input, token) {
  const fields = Object.fromEntries(
    input
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  if (fields.protocol !== 'https' || fields.host !== 'github.com') return '';
  return `username=x-access-token\npassword=${token}\n`;
}

/**
 * The lines a SessionStart hook writes to CLAUDE_ENV_FILE. The PowerShell tool
 * parses the plain assignment. The Bash tool runs the file as shell code, where
 * an assignment alone is not exported, so gh (a child process) would never see
 * it and would use the stakeholder's own login instead (issue #26).
 */
export function sessionEnvLine(token) {
  const value = typeof token === 'string' && TOKEN_RE.test(token) ? token : 'unavailable';
  return `GH_TOKEN=${value}\nexport GH_TOKEN\n`;
}

async function main(args) {
  const home = process.env.AGENT_OS_HOME || join(homedir(), '.agent-os');
  const now = Math.floor(Date.now() / 1000);
  const [command, action] = args;

  if (command === 'session-env') {
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (!envFile) return 0;
    try {
      // "unavailable" goes in before any network call, so a crash or the
      // hook's timeout still leaves gh failing rather than falling back to
      // the stakeholder's own login. The token line after it wins.
      appendFileSync(envFile, sessionEnvLine(null));
    } catch {
      process.stderr.write('github-app: could not write CLAUDE_ENV_FILE; gh may use another login\n');
      return 0;
    }
    try {
      const token = await getToken({ home, fetch: globalThis.fetch, now });
      appendFileSync(envFile, sessionEnvLine(token));
    } catch (error) {
      process.stderr.write(`github-app: ${error.message}; GH_TOKEN left "unavailable"\n`);
    }
    return 0;
  }

  if (command === 'credential') {
    // git also calls store and erase; there is nothing to store.
    if (action !== 'get') return 0;
    const input = readFileSync(0, 'utf8');
    try {
      const token = await getToken({ home, fetch: globalThis.fetch, now });
      process.stdout.write(credentialResponse(input, token));
    } catch (error) {
      // No answer: git then fails rather than using another credential.
      process.stderr.write(`github-app: ${error.message}\n`);
    }
    return 0;
  }

  process.stderr.write('usage: token.mjs session-env | credential get\n');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
