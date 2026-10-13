// Reads a decision file as it is on the local origin/main, never the working
// copy. This is the only non-test module in tools/onboard that runs a process.
// Any failure is { found: false }, so callers fail closed. No shell, no network:
// lazy fetch and credential prompts are switched off.

import { execFileSync } from 'node:child_process';

export const DECISION_PATH = /^docs\/decisions\/[A-Za-z0-9._-]+\.md$/;

/** Returns { found: true, text } or { found: false }. Never throws. */
export function readFromOriginMain(root, path) {
  if (typeof path !== 'string' || !DECISION_PATH.test(path)) return { found: false };
  try {
    const text = execFileSync('git', ['show', 'refs/remotes/origin/main:' + path], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 262144,
      encoding: 'utf8',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    });
    return { found: true, text };
  } catch {
    return { found: false };
  }
}
