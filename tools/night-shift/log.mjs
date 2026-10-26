// The night shift's daily log: one Markdown file a day, kept outside every
// repository, in <home>/night-shift/YYYY-MM-DD.md.
//
//   node tools/night-shift/log.mjs append --entry-file PATH   # entry JSON
//   node tools/night-shift/log.mjs brief  --text-file PATH    # "## Morning brief"
//   node tools/night-shift/log.mjs prune                      # day logs older than 30 days
//
// <home> is AGENT_OS_HOME, or ~/.agent-os, as in tools/github-app/token.mjs.
// An entry has a fixed schema and unknown fields are refused, so an issue
// body, a comment or a token can't get in. Exit 1 on a refused entry, 2 on a
// usage error. No dependencies: Node 20+.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanTitle, REASONS, redact } from './pick.mjs';

export { redact };

const OUTCOMES = ['pr', 'blocked', 'nothing-ready', 'paused', 'done-tonight', 'main-red', 'stop'];

// The picker's reasons, and the ones the instructions report after picking
// (spec, "What the night shift does": steps 4, 6, 7 and 8).
const ALLOWED_REASONS = [
  ...Object.values(REASONS),
  'dope-tdd was not guarding',
  'forbidden path in the diff',
  'three attempts at green failed',
  'what done looks like is unclear',
];

const FIELDS = ['time', 'outcome', 'issue', 'title', 'prUrl', 'handoff', 'checks', 'reason'];
const PR_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
const BRIEF_MAX_BYTES = 4096;
const KEEP_DAYS = 30;

export const logDir = (home) => join(home, 'night-shift');

const pad = (n) => String(n).padStart(2, '0');
const dayName = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

function validate(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('an entry is a JSON object');
  for (const key of Object.keys(entry)) {
    if (!FIELDS.includes(key)) throw new Error(`unknown field: ${key}`);
  }
  const { time, outcome, issue, title, prUrl, handoff, checks, reason } = entry;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(time) || Number.isNaN(Date.parse(time))) {
    throw new Error('time must be an ISO date-time');
  }
  if (!OUTCOMES.includes(outcome)) throw new Error(`outcome must be one of: ${OUTCOMES.join(', ')}`);
  if (issue != null && !(Number.isSafeInteger(issue) && issue > 0)) throw new Error('issue must be an issue number');
  if (title != null && typeof title !== 'string') throw new Error('title must be text');
  if (prUrl != null && !(typeof prUrl === 'string' && PR_URL.test(prUrl))) throw new Error('prUrl must be a GitHub PR URL');
  if (handoff != null && !(typeof handoff === 'string' && PR_URL.test(handoff))) {
    throw new Error('handoff must be a GitHub PR URL');
  }
  if (checks != null) {
    const keys = Object.keys(checks).sort().join();
    if (keys !== 'fail,pass,tests' || ![checks.tests, checks.pass, checks.fail].every(isCount)) {
      throw new Error('checks must be { tests, pass, fail } counts');
    }
  }
  if (reason != null && !ALLOWED_REASONS.includes(reason)) throw new Error('reason must be one of the fixed reasons');
}

function format(entry) {
  const lines = [`## ${entry.time} ${entry.outcome}`, `- time: ${entry.time}`, `- outcome: ${entry.outcome}`];
  const title = entry.title == null ? '' : ` ${cleanTitle(entry.title)}`;
  lines.push(entry.issue == null ? '- issue: none' : `- issue: #${entry.issue}${title}`);
  if (entry.prUrl) lines.push(`- pr: ${entry.prUrl}`);
  if (entry.handoff) lines.push(`- handoff: ${entry.handoff}`);
  if (entry.checks) {
    const { tests, pass, fail } = entry.checks;
    lines.push(`- checks: ${tests} tests, ${pass} pass, ${fail} fail`);
  }
  if (entry.reason) lines.push(`- reason: ${entry.reason}`);
  return `${lines.join('\n')}\n`;
}

function append(text, { home, now }) {
  const dir = logDir(home);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${dayName(now)}.md`);
  const header = existsSync(file) ? '' : `# Night shift ${dayName(now)}\n`;
  appendFileSync(file, `${header}\n${text}`);
  return file;
}

/** Validates the entry, then appends it to today's log. Throws on a bad entry. */
export function appendEntry(entry, { home, now = new Date() }) {
  validate(entry);
  return append(format(entry), { home, now });
}

// Cut at a byte limit without leaving half a character behind.
function cutBytes(text, max) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= max) return text;
  return bytes.subarray(0, max).toString('utf8').replace(/�+$/, '');
}

/** Appends the morning brief: free text, so it is redacted and capped. */
export function appendBrief(text, { home, now = new Date() }) {
  const brief = cutBytes(redact(text), BRIEF_MAX_BYTES).replace(/\n*$/, '');
  return append(`## Morning brief\n${brief}\n`, { home, now });
}

/** Deletes day logs older than 30 days. Returns the names it deleted. */
export function prune({ home, now = new Date() }) {
  const dir = logDir(home);
  if (!existsSync(dir)) return [];
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS);
  const deleted = [];
  for (const name of readdirSync(dir).sort()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(name);
    if (!match) continue;
    if (new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) < cutoff) {
      rmSync(join(dir, name));
      deleted.push(name);
    }
  }
  return deleted;
}

function main(argv) {
  const home = process.env.AGENT_OS_HOME || join(homedir(), '.agent-os');
  const [verb, flag, path] = argv;
  if (verb === 'append' && flag === '--entry-file' && path) {
    appendEntry(JSON.parse(readFileSync(path, 'utf8')), { home });
  } else if (verb === 'brief' && flag === '--text-file' && path) {
    appendBrief(readFileSync(path, 'utf8'), { home });
  } else if (verb === 'prune' && argv.length === 1) {
    console.log(JSON.stringify({ deleted: prune({ home }) }));
  } else {
    console.error('usage: log.mjs append --entry-file PATH | brief --text-file PATH | prune');
    return 2;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`log.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
