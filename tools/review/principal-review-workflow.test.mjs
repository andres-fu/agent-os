// Who may start the CI principal engineer. claude-code-action refuses runs
// started by a bot unless its allowed_bots input names it (issue #28). Agents
// act as the agent-os-team GitHub App, so the reviewer must allow that one App,
// and never every bot ('*'): any GitHub App with access could then trigger a
// review, which holds the Claude token. Text checks only: no YAML dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/principal-review.yml', import.meta.url));
const text = readFileSync(WORKFLOW, 'utf8').replace(/\r\n/g, '\n');

function allowedBots() {
  const lines = text.split('\n').filter((line) => /^\s*allowed_bots:/.test(line));
  return lines.map((line) => line.replace(/^\s*allowed_bots:\s*/, '').replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, ''));
}

test('the reviewer allows the agents\' App, so agent PRs get a review', () => {
  assert.deepEqual(allowedBots(), ['agent-os-team']);
});

test('the reviewer never allows every bot', () => {
  for (const value of allowedBots()) {
    assert.doesNotMatch(value, /\*/);
  }
});

test('the review job still runs only for pull requests from this repository, not forks', () => {
  assert.match(text, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});
