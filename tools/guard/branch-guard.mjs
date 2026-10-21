// The branch guard: a PreToolUse hook that stops an agent committing, merging
// or pushing on main. Ported from andres-fu/dope-tdd's
// tools/guard/branch-guard.ts. "Work on a branch" was a rule nothing enforced
// locally; this hook is the local half. The ruleset on main is the half that
// cannot be talked past: a command spelled in a way this reading misses still
// meets it on push.
//
// Wired in .claude/settings.json under hooks.PreToolUse, matcher
// "Bash|PowerShell". Claude Code passes the tool call as JSON on stdin; exit 2
// blocks it and shows stderr to the agent. Anything this cannot read (bad
// input, a folder that is not a git checkout) lets the command through: the
// guard must never wedge a session. No dependencies: Node 20+.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Subcommands that make or publish commits. Pull, fetch, checkout and every
// read stay allowed on main.
const WRITES = new Set(['commit', 'merge', 'cherry-pick', 'revert', 'rebase', 'am', 'push']);
// Global options that take the next word as their value (`git -C dir`, `git -c key=value`).
const OPTION_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** The git subcommand and its arguments in one segment of a shell command, or null when it is not a git command. */
function gitCall(segment) {
  const words = segment.trim().split(/\s+/);
  // Leading `NAME=value` assignments, as in `GIT_EDITOR=true git merge x`.
  while (words.length > 0 && /^[A-Za-z_]\w*=/.test(words[0])) words.shift();
  if (words.shift() !== 'git') return null;
  while (words.length > 0 && words[0].startsWith('-')) {
    const option = words.shift();
    if (OPTION_WITH_VALUE.has(option)) words.shift();
  }
  const sub = words.shift();
  return sub === undefined ? null : { sub, args: words };
}

/** A push whose refspec lands on main: `main`, `+main`, `HEAD:main`, `fix:main`. */
function pushesToMain(args) {
  return args
    .filter((arg) => !arg.startsWith('-'))
    .slice(1)
    .some((ref) => /^\+?main$/.test(ref) || /:main$/.test(ref));
}

/** Why `command` is refused on `branch`, or null when it may run. */
export function blockedBy(command, branch) {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const call = gitCall(segment);
    if (call === null || !WRITES.has(call.sub)) continue;
    if (branch === 'main') {
      return `branch guard: \`git ${call.sub}\` on main is not allowed here. Make a branch first (git checkout -b <name>), then open a pull request.`;
    }
    if (call.sub === 'push' && pushesToMain(call.args)) {
      return 'branch guard: pushing to main is not allowed here. Push your branch and open a pull request.';
    }
  }
  return null;
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function main(stdin) {
  let input;
  try {
    input = JSON.parse(stdin);
  } catch {
    return 0;
  }
  const command = input?.tool_input?.command;
  const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
  if (typeof command !== 'string') return 0;
  // The branch where the command runs: the hook's cwd follows the agent into a
  // worktree, the project dir does not.
  const branch = currentBranch(cwd);
  if (branch === null) return 0;
  const reason = blockedBy(command, branch);
  if (reason === null) return 0;
  process.stderr.write(`${reason}\n`);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(readFileSync(0, 'utf8'));
}
