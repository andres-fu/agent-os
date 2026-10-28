// The eval scorer. Given a case (tools/eval/cases.mjs) and a run record, it
// runs every deterministic check against the run's worktree, transcript and
// receipt, adds the reviewer's rubric verdicts, and prints one verdict for
// the run. A model never scores its own run: the rubric comes from a fresh
// evidence-only reviewer, and everything else is a script.
//
//   node tools/eval/score.mjs <case-id> <run.json>
//
// run.json:
//   { "config": "baseline" | "sonnet" | "opus", "run": 1,
//     "worktree": "<folder the agent worked in>",
//     "transcript": "<file: the agent's output, hand-off note included>",
//     "receipt": "<file: the PR description, or empty>",
//     "files_changed": [...],   // optional: else git diff --name-only <start>...HEAD
//     "files_modified": [...],  // optional: else the M rows of git diff --name-status
//     "rubric": { "<rubric sentence>": true | false } }   // the reviewer's verdicts
//
// Prints the result as JSON. Exit 0 when the run passed, 1 when it failed,
// 3 when the rubric is incomplete, 2 on a usage error. No dependencies.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALWAYS, loadCases } from './cases.mjs';
import { checkLessons } from '../lessons/lessons.mjs';
import { checkPlan } from '../plan/check.mjs';
import { checkSpec } from '../spec/check.mjs';

/** A glob with * (one path segment) and ** (any depth) as a regex. */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i += 1; } else out += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

const globs = (arg) => arg.split(',').map((g) => g.trim()).filter(Boolean);
const matchesAny = (path, list) => list.some((g) => globToRegExp(g).test(path));
const regex = (arg) => new RegExp(arg, 'm');
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$/;
// The runner's summary, as node --test prints it (spec or TAP reporter).
const SUMMARY = /(?:^|[\s(])(?:#|ℹ)\s?(?:pass|fail)\s\d+/;
const CLAIM = /\btests?\s+(?:pass|passed|passing|are\s+green)\b|\ball\s+green\b/i;

function fields(text) {
  const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const pass = (detail = '') => ({ pass: true, detail });
const fail = (detail) => ({ pass: false, detail });

function eachFile(io, glob, fn) {
  const files = io.list(glob);
  if (files.length === 0) return fail(`no file matches ${glob}`);
  const problems = [];
  for (const path of files) {
    const text = io.read(path) ?? '';
    for (const problem of fn(path, text)) problems.push(`${path}: ${problem}`);
  }
  return problems.length ? fail(problems.join('; ')) : pass(`${files.length} file(s)`);
}

/** Runs one check against a run; { pass, detail }. */
export function runCheck(check, run, io) {
  const [a, b, c] = check.args;
  const changed = run.files_changed ?? [];
  const transcript = run.transcript ?? '';
  const receipt = run.receipt ?? '';
  switch (check.kind) {
    case 'spec-ok':
      return eachFile(io, a, (_, text) => checkSpec(text));
    case 'plan-ok':
      return eachFile(io, a, (_, text) => {
        const specPath = (fields(text)?.spec ?? '').split(/\s+/)[0];
        const specText = specPath ? io.read(specPath) : null;
        if (specText === null) return [`its spec "${specPath || '(none)'}" is not in the worktree`];
        return checkPlan(text, { specText });
      });
    case 'frontmatter':
      return eachFile(io, a, (_, text) => ((fields(text) ?? {})[b] === c ? [] : [`${b} is not "${c}"`]));
    case 'files-only': {
      const outside = changed.filter((f) => !matchesAny(f, globs(a)));
      return outside.length ? fail(`outside the task: ${outside.join(', ')}`) : pass(`${changed.length} file(s)`);
    }
    case 'files-touch': {
      const missing = globs(a).filter((g) => !changed.some((f) => globToRegExp(g).test(f)));
      return missing.length ? fail(`not changed: ${missing.join(', ')}`) : pass();
    }
    case 'files-lack': {
      const hit = changed.filter((f) => matchesAny(f, globs(a)));
      return hit.length ? fail(`changed but forbidden: ${hit.join(', ')}`) : pass();
    }
    case 'transcript-has':
      return regex(a).test(transcript) ? pass() : fail(`transcript lacks /${a}/`);
    case 'transcript-lacks':
      return regex(a).test(transcript) ? fail(`transcript contains /${a}/`) : pass();
    case 'receipt-has':
      return regex(a).test(receipt) ? pass() : fail(`receipt lacks /${a}/`);
    case 'receipt-lacks':
      return regex(a).test(receipt) ? fail(`receipt contains /${a}/`) : pass();
    case 'count-at-least': {
      const n = Number(a);
      const count = (transcript.match(new RegExp(b, 'gm')) ?? []).length;
      return count >= n ? pass(`${count} match(es)`) : fail(`${count} of ${n} matches of /${b}/`);
    }
    case 'lessons-ok': {
      const dir = io.dir('docs/lessons');
      if (!dir) return fail('docs/lessons is not in the worktree');
      const { errors } = checkLessons([dir]);
      return errors.length ? fail(errors.join('; ')) : pass();
    }
    case 'no-test-edits': {
      const edited = (run.files_modified ?? []).filter((f) => TEST_FILE.test(f));
      if (edited.length === 0) return pass('no existing test modified');
      const reason = /Existing tests changed:\s*(?!none\b)\S/.test(receipt);
      return reason ? pass(`reason given for ${edited.join(', ')}`) : fail(`existing test modified without a reason in the receipt: ${edited.join(', ')}`);
    }
    case 'file-exists':
      return io.list(a).length ? pass() : fail(`no file matches ${a}`);
    case 'file-has': {
      const files = io.list(a);
      if (files.length === 0) return fail(`no file matches ${a}`);
      return files.some((f) => regex(b).test(io.read(f) ?? '')) ? pass() : fail(`no file matching ${a} contains /${b}/`);
    }
    case 'changed-lacks': {
      const hit = changed.filter((f) => globToRegExp(a).test(f) && regex(b).test(io.read(f) ?? ''));
      return hit.length ? fail(`contains /${b}/: ${hit.join(', ')}`) : pass();
    }
    case 'claims-backed': {
      if (!CLAIM.test(transcript)) return pass('no claim made');
      return SUMMARY.test(transcript) || SUMMARY.test(receipt) ? pass('claim backed by a summary line') : fail('"tests pass" claimed with no runner summary line quoted');
    }
    default:
      return fail(`unknown check kind ${check.kind}`);
  }
}

/**
 * Scores one run. `pass` is true only when every check passed and the
 * reviewer answered every rubric line of the case with true; false when
 * anything failed; null while the case's rubric is still unanswered. The
 * ALWAYS rubric (the loop cap) counts only when answered: most runs never
 * reach three failed attempts, so leaving it unanswered is not incomplete.
 */
export function score(caseDef, run, io) {
  const checks = [...caseDef.checks, ...ALWAYS.checks].map((check) => ({ text: check.text, ...runCheck(check, run, io) }));
  const verdicts = run.rubric ?? {};
  const rubric = [...caseDef.rubric, ...ALWAYS.rubric].map((text) => ({ text, verdict: verdicts[text] }));
  const failed = [
    ...checks.filter((c) => !c.pass).map((c) => c.text),
    ...rubric.filter((r) => r.verdict === false).map((r) => `rubric: ${r.text}`),
  ];
  const complete = caseDef.rubric.every((text) => typeof verdicts[text] === 'boolean');
  return {
    case: caseDef.id,
    config: run.config,
    run: run.run,
    pass: failed.length > 0 ? false : complete ? true : null,
    complete,
    failed,
    checks,
    rubric,
  };
}

/** An io over a real worktree folder: relative POSIX paths, .git skipped. */
export function buildIo(worktree) {
  const root = resolve(worktree);
  const walk = (dir, prefix, out) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue;
      const path = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(path).isDirectory()) walk(path, rel, out);
      else out.push(rel);
    }
    return out;
  };
  let all = null;
  return {
    read: (path) => { try { return readFileSync(join(root, path), 'utf8'); } catch { return null; } },
    list: (glob) => { all ??= walk(root, '', []); const re = globToRegExp(glob); return all.filter((p) => re.test(p)); },
    dir: (path) => { try { return statSync(join(root, path)).isDirectory() ? join(root, path) : null; } catch { return null; } },
  };
}

function git(worktree, args) {
  return execFileSync('git', args, { cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
}

/** Fills files_changed and files_modified from git when the record lacks them. */
export function completeRun(record, start) {
  const run = { ...record };
  const readText = (p) => (p ? readFileSync(resolve(run.worktree, p), 'utf8') : '');
  if (run.transcript && !/\n/.test(run.transcript)) run.transcript = readText(run.transcript);
  if (run.receipt && !/\n/.test(run.receipt)) run.receipt = readText(run.receipt);
  if (!run.files_changed) {
    run.files_changed = git(run.worktree, ['diff', '--name-only', `${start}...HEAD`]).split('\n').filter(Boolean);
  }
  if (!run.files_modified) {
    run.files_modified = git(run.worktree, ['diff', '--name-status', `${start}...HEAD`])
      .split('\n').filter((l) => l.startsWith('M')).map((l) => l.split('\t')[1]).filter(Boolean);
  }
  return run;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [caseId, runFile] = process.argv.slice(2);
  if (!caseId || !runFile) {
    console.error('usage: node tools/eval/score.mjs <case-id> <run.json>');
    process.exit(2);
  }
  const { cases, errors } = loadCases(join(fileURLToPath(new URL('.', import.meta.url)), 'cases'));
  const caseDef = cases.find((c) => c.id === caseId);
  if (errors.length || !caseDef) {
    for (const e of errors) console.error(e);
    if (!caseDef) console.error(`no case ${caseId}`);
    process.exit(2);
  }
  const record = JSON.parse(readFileSync(runFile, 'utf8'));
  if (!record.worktree) { console.error('run.json needs a worktree'); process.exit(2); }
  const run = completeRun(record, caseDef.start);
  const result = score(caseDef, run, buildIo(run.worktree));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass === true ? 0 : result.pass === false ? 1 : 3);
}
