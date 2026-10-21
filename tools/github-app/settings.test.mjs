// How .claude/settings.json wires the agents' GitHub identity. GH_TOKEN starts
// as "unavailable" in every session, so gh fails closed if the SessionStart
// hook never runs, and the hook's plain GH_TOKEN=<token> line updates a
// variable that is already exported in Bash (issue #26). The stakeholder edits
// this file; agents are denied writing it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SETTINGS = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url));
const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));

test('every session starts with GH_TOKEN set to "unavailable"', () => {
  assert.equal(settings.env?.GH_TOKEN, 'unavailable');
});

test('a SessionStart hook replaces it with the App token', () => {
  const commands = (settings.hooks?.SessionStart ?? []).flatMap((entry) => entry.hooks ?? []).map((hook) => hook.command);
  assert.ok(
    commands.some((command) => /tools\/github-app\/token\.mjs" session-env$/.test(command)),
    `no SessionStart hook runs token.mjs session-env: ${JSON.stringify(commands)}`,
  );
});
