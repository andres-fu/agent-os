// The night shift's picker: does tonight run, and on which issue?
//
//   node tools/night-shift/pick.mjs tonight --repo OWNER/NAME --stakeholder LOGIN --app-login LOGIN --workflow FILE [--now ISO]
//   node tools/night-shift/pick.mjs facts   --repo OWNER/NAME --stakeholder LOGIN --app-login LOGIN --workflow FILE
//
// Every yes/no decision the spec makes about GitHub data lives here, so a
// model never makes it from prose. `decide` is pure; the GitHub reads that
// feed it live in `gather`. `facts` is all the morning brief may see. Prints
// one JSON line; exit 2 is a usage error. No dependencies: Node 20+.
//
// Spec: docs/specs/2026-10-21-night-shift.md. Plan: its -plan.md.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeGh } from './github.mjs';

// Fixed reasons. A reason is never built from issue, PR or run text, so the
// log and the brief can repeat it safely.
export const REASONS = {
  identity: 'not running as the App for this repository',
  prState: 'PR state could not be read',
  issuesUnread: 'issues could not be read',
  failed: 'the picker failed',
  mainUnread: 'main CI state could not be read',
  mainRunning: 'main CI is still running',
  mainUnfinished: 'main CI did not pass or fail',
  needsHuman: 'needs-human',
  labelActor: 'label not added by the stakeholder',
  outsideAuthor: 'author not a collaborator',
  editedAfterReady: 'edited after it was marked ready',
  editUnreadable: 'edit time unreadable',
  prFixes: 'an open PR fixes it',
};

const COLLABORATORS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const MAIN_RED = ['failure', 'timed_out', 'startup_failure'];
export const CAP = 3;
// gh pr list stops here; a full list means some PRs may be missing.
const PR_LIMIT = 1000;
const TITLE_MAX = 120;
const WITHHELD = '(title withheld: outside author)';
// No leading \b: "_" is a word character, so x_ghs_... would slip past it.
// Installation tokens now hold "." and "-" (issue #60), so the token runs on
// through them, but only while more token characters follow: a full stop
// ending a sentence stays.
const TOKEN = /(?:gh[spour]_|github_pat_)[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*/g;

/** Replaces anything shaped like a GitHub token with [redacted]. */
export function redact(text) {
  return String(text).replace(TOKEN, '[redacted]');
}

/** A title as the log and the brief may show it: one line, redacted, 120 characters. */
export function cleanTitle(title) {
  return redact(String(title).split(/\r?\n/)[0]).trim().slice(0, TITLE_MAX);
}

/**
 * A night PR: from this repository (not a fork), on a `night/` branch, by the
 * agents' App. A branch name alone is not an identity (L-0019).
 */
export function isNightPr(pr, { appLogin }) {
  return (
    pr.isCrossRepository === false &&
    pr.headRepository != null &&
    typeof pr.headRefName === 'string' &&
    pr.headRefName.startsWith('night/') &&
    pr.author?.login === appLogin
  );
}

export function branchFor(number, title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `night/${number}-${slug || 'issue'}`;
}

const pad = (n) => String(n).padStart(2, '0');
function localDay(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// Issue numbers that an open PR's body closes with a GitHub keyword.
function fixedBy(prs) {
  const numbers = new Set();
  for (const pr of prs) {
    for (const match of String(pr.body ?? '').matchAll(/\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?):?\s+#(\d+)\b/gi)) {
      numbers.add(Number(match[1]));
    }
  }
  return numbers;
}

function mainCi(run, repo) {
  if (!run || !Number.isSafeInteger(run.id)) return { action: 'stop', reason: REASONS.mainUnread };
  if (run.status !== 'completed') return { action: 'stop', reason: REASONS.mainRunning };
  if (run.conclusion === 'success') return null;
  if (MAIN_RED.includes(run.conclusion)) {
    // Built from the run's numeric id only: no run, commit or issue text.
    return { action: 'main-red', notify: `${repo}: main CI is red https://github.com/${repo}/actions/runs/${run.id}` };
  }
  // Cancelled, skipped, neutral and the rest: we can't tell main is healthy.
  return { action: 'stop', reason: REASONS.mainUnfinished };
}

// Why an issue can't be worked tonight, or null when it can.
function skipReason(issue, { stakeholder, fixed }) {
  if (issue.labels.includes('needs-human')) return { reason: REASONS.needsHuman };
  if (fixed.has(issue.number)) return { reason: REASONS.prFixes };
  if (!sameLogin(issue.readyLabel?.actor, stakeholder)) return { reason: REASONS.labelActor };
  if (!COLLABORATORS.includes(issue.authorAssociation)) return { reason: REASONS.outsideAuthor };
  // undefined means the edit time could not be read; null means never edited.
  if (issue.lastEditedAt === undefined) return { reason: REASONS.editUnreadable };
  if (issue.lastEditedAt !== null && Date.parse(issue.lastEditedAt) >= Date.parse(issue.readyLabel.at)) {
    // The spec blocks such an issue (comment and needs-human), not just
    // passes it over; the instructions act on `block`.
    return { reason: REASONS.editedAfterReady, block: true };
  }
  return null;
}

/**
 * Decides tonight from what `gather` read. The order is fixed: identity,
 * main CI, the cap, today's PR, then the issue. Anything unreadable stops.
 */
export function decide(facts, { now, stakeholder, appLogin }) {
  const { tokenIsApp, repos } = facts.identity ?? {};
  if (tokenIsApp !== true || !Array.isArray(repos) || repos.length !== 1 || !sameLogin(repos[0], facts.repo)) {
    return { action: 'stop', reason: REASONS.identity };
  }

  const main = mainCi(facts.mainRun, facts.repo);
  if (main) return main;

  // A later read failed. Checked after main CI, so main red is still reported.
  if (facts.stop) return { action: 'stop', reason: facts.stop };

  if (facts.openPrsTruncated || facts.recentPrsTruncated || facts.openPrs.some((pr) => pr.headRepository == null)) {
    return { action: 'stop', reason: REASONS.prState };
  }
  const night = (pr) => isNightPr(pr, { appLogin });
  const waiting = facts.openPrs.filter(night).length;
  if (waiting >= CAP) return { action: 'paused', waiting };

  // Closed and merged PRs count too, so a PR closed tonight still uses up
  // tonight.
  const today = localDay(now);
  if ([...facts.openPrs, ...facts.recentPrs].some((pr) => night(pr) && localDay(pr.createdAt) === today)) {
    return { action: 'done-tonight' };
  }

  // A fork's "Fixes #3" must not block #3 (L-0019).
  const fixed = fixedBy(facts.openPrs.filter((pr) => pr.isCrossRepository === false));
  const ready = facts.issues
    .filter((issue) => issue.labels.includes('ready'))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const skipped = [];
  for (const issue of ready) {
    const skip = skipReason(issue, { stakeholder, fixed });
    if (skip) {
      skipped.push({ number: issue.number, ...skip });
      continue;
    }
    const comments = issue.comments
      .filter((comment) => COLLABORATORS.includes(comment.authorAssociation))
      .map(({ author, body }) => ({ author, body }));
    return {
      action: 'work',
      issue: { number: issue.number, title: issue.title, body: issue.body, comments },
      branch: branchFor(issue.number, issue.title),
      skipped,
    };
  }
  return { action: 'nothing-ready', skipped };
}

// --- Reading GitHub ---------------------------------------------------------

const PR_FIELDS = 'number,author,headRefName,headRepository,isCrossRepository,createdAt';

async function readMainRun(gh, { repo, workflow }) {
  // Push events on main only: a fork's PR from a branch it named `main` runs
  // as a pull_request event, and must not count as main (L-0019).
  try {
    const runs = await gh.json([
      'run', 'list', '--repo', repo, '--workflow', workflow, '--branch', 'main', '--event', 'push',
      '--limit', '1', '--json', 'databaseId,status,conclusion',
    ]);
    const run = runs[0];
    return run ? { id: run.databaseId, status: run.status, conclusion: run.conclusion } : null;
  } catch {
    return null;
  }
}

const readOpenPrs = (gh, repo) =>
  gh.json([
    'pr', 'list', '--repo', repo, '--state', 'open', '--limit', String(PR_LIMIT),
    '--json', `${PR_FIELDS},isDraft,body,title,statusCheckRollup`,
  ]);

// PRs in any state created since yesterday, so a night PR closed or merged
// tonight still counts as tonight's. The search date is a day early because
// GitHub's dates are UTC; `decide` compares local days.
function readRecentPrs(gh, repo, now) {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return gh.json([
    'pr', 'list', '--repo', repo, '--state', 'all', '--limit', String(PR_LIMIT),
    '--search', `created:>=${localDay(since)}`, '--json', PR_FIELDS,
  ]);
}

async function readIssues(gh, repo, label) {
  const issues = await gh.pages(`repos/${repo}/issues?state=open&labels=${label}&per_page=100`);
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      createdAt: issue.created_at,
      labels: (issue.labels ?? []).map((l) => l.name),
      authorAssociation: issue.author_association,
    }))
    .filter((issue) => issue.labels.includes(label));
}

async function readReadyLabel(gh, repo, number) {
  const events = await gh.pages(`repos/${repo}/issues/${number}/events`);
  const labelled = events.filter((e) => e.event === 'labeled' && e.label?.name === 'ready').at(-1);
  return labelled ? { actor: labelled.actor?.login, at: labelled.created_at } : null;
}

// The body's own last edit, not updated_at (which any comment moves).
// undefined means it could not be read, and the issue is skipped.
async function readLastEdited(gh, repo, number) {
  if (!Number.isSafeInteger(number) || number < 1) return undefined;
  const [owner, name] = repo.split('/');
  // The number is checked above and inlined: -f passes every variable as a
  // string, and GraphQL refuses a string for Int.
  const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { issue(number: ${number}) { lastEditedAt } } }`;
  try {
    const data = await gh.graphql(query, { owner, name });
    const edited = data.repository?.issue?.lastEditedAt;
    return edited === null || typeof edited === 'string' ? edited : undefined;
  } catch {
    return undefined;
  }
}

async function readComments(gh, repo, number) {
  const comments = await gh.pages(`repos/${repo}/issues/${number}/comments`);
  return comments.map((c) => ({ author: c.user?.login, authorAssociation: c.author_association, body: c.body ?? '' }));
}

/** Reads everything `decide` needs. A failed read becomes a stop, never an empty list. */
export async function gather(gh, { repo, workflow, token, now }) {
  const facts = { repo, identity: { tokenIsApp: typeof token === 'string' && token.startsWith('ghs_'), repos: [] } };
  // Nothing is read with any other token: it could be a person's.
  if (!facts.identity.tokenIsApp) return facts;
  try {
    const pages = await gh.pages('installation/repositories', { key: 'repositories' });
    facts.identity.repos = pages.map((r) => r.full_name);
  } catch {
    return facts;
  }
  if (facts.identity.repos.length !== 1) return facts;

  facts.mainRun = await readMainRun(gh, { repo, workflow });

  try {
    facts.openPrs = await readOpenPrs(gh, repo);
    facts.recentPrs = await readRecentPrs(gh, repo, now);
  } catch {
    return { ...facts, stop: REASONS.prState };
  }
  facts.openPrsTruncated = facts.openPrs.length >= PR_LIMIT;
  facts.recentPrsTruncated = facts.recentPrs.length >= PR_LIMIT;

  try {
    facts.issues = [];
    for (const issue of await readIssues(gh, repo, 'ready')) {
      // decide skips needs-human first, so its details are never needed.
      const details = issue.labels.includes('needs-human')
        ? { readyLabel: null, lastEditedAt: null, comments: [] }
        : {
            readyLabel: await readReadyLabel(gh, repo, issue.number),
            lastEditedAt: await readLastEdited(gh, repo, issue.number),
            comments: await readComments(gh, repo, issue.number),
          };
      facts.issues.push({ ...issue, ...details });
    }
  } catch {
    return { ...facts, stop: REASONS.issuesUnread };
  }
  return facts;
}

/** Tonight's decision, from GitHub. */
export async function tonight(gh, options) {
  return decide(await gather(gh, options), options);
}

// --- What the morning brief may see -----------------------------------------

const FAILING = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];

// statusCheckRollup mixes check runs ({ status, conclusion }) and commit
// statuses ({ state }).
function ciState(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none';
  const outcome = (check) => String(check.conclusion || check.state || '').toUpperCase();
  if (rollup.some((check) => FAILING.includes(outcome(check)))) return 'failing';
  const pending = (check) => (check.status ? check.status !== 'COMPLETED' : ['PENDING', 'EXPECTED'].includes(outcome(check)));
  return rollup.some(pending) ? 'pending' : 'passing';
}

// Night PRs leave draft only by the stakeholder's hand. One with no
// ready-for-review event was opened as ready, which is also a breach.
async function readiedByOther(gh, repo, pr, stakeholder) {
  try {
    const events = await gh.pages(`repos/${repo}/issues/${pr.number}/events`);
    const ready = events.filter((e) => e.event === 'ready_for_review').at(-1);
    return !sameLogin(ready?.actor?.login, stakeholder);
  } catch {
    return true;
  }
}

/**
 * Everything the brief may see: numbers, URLs built from ids, fixed words,
 * and titles only from collaborators or night PRs. Never a body or comment.
 */
export async function briefFacts(gh, { repo, workflow, stakeholder, appLogin }) {
  const base = `https://github.com/${repo}`;
  const run = await readMainRun(gh, { repo, workflow });
  const runUrl = run && Number.isSafeInteger(run.id) ? `${base}/actions/runs/${run.id}` : null;
  let state = 'unknown';
  if (run?.status === 'completed' && run.conclusion === 'success') state = 'success';
  else if (run?.status === 'completed' && MAIN_RED.includes(run.conclusion)) state = 'red';

  let openPrs;
  try {
    openPrs = await readOpenPrs(gh, repo);
  } catch {
    return { error: REASONS.prState };
  }
  const night = openPrs.filter((pr) => isNightPr(pr, { appLogin }));
  const nightPrs = night.map((pr) => ({
    number: pr.number,
    url: `${base}/pull/${pr.number}`,
    title: cleanTitle(pr.title ?? ''),
    draft: pr.isDraft === true,
    ci: ciState(pr.statusCheckRollup),
  }));
  const readied = [];
  for (const pr of night.filter((p) => p.isDraft !== true)) {
    if (await readiedByOther(gh, repo, pr, stakeholder)) readied.push(pr.number);
  }

  const shown = (issue) => ({
    number: issue.number,
    url: `${base}/issues/${issue.number}`,
    title: COLLABORATORS.includes(issue.authorAssociation) ? cleanTitle(issue.title) : WITHHELD,
  });
  let ready;
  let needsHuman;
  try {
    ready = (await readIssues(gh, repo, 'ready')).filter((i) => !i.labels.includes('needs-human')).map(shown);
    needsHuman = (await readIssues(gh, repo, 'needs-human')).map(shown);
  } catch {
    return { error: REASONS.issuesUnread };
  }

  return { repo, mainCi: { state, url: runUrl }, nightPrs, readiedByOther: readied, needsHuman, ready };
}

// --- The command ------------------------------------------------------------

// Letters, digits, ., _ and -, starting with a letter or digit; one optional
// "/" part. No "..", so a value can't climb out of an API path.
const NAME = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)?$/;
const valid = (value, pattern = NAME) => typeof value === 'string' && pattern.test(value) && !value.includes('..');

function parse(argv) {
  const [verb, ...rest] = argv;
  if (verb !== 'tonight' && verb !== 'facts') return null;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--repo', '--stakeholder', '--app-login', '--workflow', '--now'].includes(rest[i])) return null;
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  const { repo, stakeholder, workflow, now } = flags;
  const appLogin = flags['app-login'];
  if (!valid(repo) || !repo.includes('/')) return null;
  if (!valid(stakeholder, /^[A-Za-z0-9][\w-]*$/) || !valid(appLogin) || !valid(workflow, /^[A-Za-z0-9][\w.-]*$/)) {
    return null;
  }
  if (now !== undefined && !(/^\d{4}-\d{2}-\d{2}T/.test(now) && !Number.isNaN(Date.parse(now)))) return null;
  return { verb, repo, stakeholder, appLogin, workflow, now: now ? new Date(now) : new Date() };
}

async function main(argv) {
  const options = parse(argv);
  if (!options) {
    console.error('usage: pick.mjs tonight|facts --repo OWNER/NAME --stakeholder LOGIN --app-login LOGIN --workflow FILE [--now ISO]');
    return 2;
  }
  const gh = makeGh();
  const token = process.env.GH_TOKEN;
  const result = options.verb === 'tonight' ? await tonight(gh, { ...options, token }) : await briefFacts(gh, options);
  console.log(JSON.stringify(result));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      // Fail closed, with a fixed reason: the error text could hold anything.
      console.log(JSON.stringify({ action: 'stop', reason: REASONS.failed }));
      process.exitCode = 1;
    },
  );
}
