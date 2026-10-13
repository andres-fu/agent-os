// The /onboard status and validate commands.
//
//   node tools/onboard/check.mjs status   [--root DIR] [--json]    # 0 ready, 1 invalid, 2 usage, 3 BLOCKED
//   node tools/onboard/check.mjs validate [--root DIR] [--strict] [--json]
//
// Output rule (docs/specs/2026-10-11-onboard-plan.md, "Shared conventions"):
// no text taken from a file is ever printed. Messages are fixed, questions
// are named by id, file names are cut down to [A-Za-z0-9._/-], and a decision
// path is printed only if it matches its pattern. Node built-ins only.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASK_ORDER, SECTION_MARKERS, parseIntake } from './intake.mjs';
import { HIGHLY_SENSITIVE_CATEGORIES, dataGate } from './data-gate.mjs';
import { DECISION_PATH, readFromOriginMain } from './git-main.mjs';
import { findIdentifiers } from './identifiers.mjs';

// Personal details that warn but never block (stakeholder decision, 2026-10-13):
// the tools a project builds may need real names; the intake never holds them.
const PERSONAL_DETAILS = ['names', 'birthdates', 'family', 'school'];
const PERSONAL_NOTE =
  'Note: this involves personal details. Use real ones only where your organisation allows, and never in this file.';

export const INTAKE_FILE = 'docs/project/intake.md';
const PROJECT_DIR = 'docs/project';
const GROUPS = ['Discovery', 'Data', 'Guardrails', 'Setup'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SENSITIVE_IDS = new Set(HIGHLY_SENSITIVE_CATEGORIES.flatMap((c) => c.options));

// The only gate reasons that may be printed; anything else becomes "blocked".
const GATE_REASONS = new Set([
  'Q6 is not answered',
  'no decision recorded: run /escalate',
  'decision path is not valid',
  'not on origin/main: run git fetch origin',
  'not decided yet',
  'decision is not to build',
  'decision covers different Q6 answers',
]);

const MESSAGES = {
  invalidIntake: 'The intake is not valid. Fix it, or ask the stakeholder.',
  noIntake: 'There is no intake yet. Run: node tools/onboard/record.mjs create',
  symlinkIntake: 'The intake must not be a symbolic link.',
  unexpected: 'Unexpected error.',
};

// ---- shared helpers (record.mjs uses these too) ---------------------------

/** Cuts a file name down to characters that cannot carry a log command. */
export const safeName = (name) => String(name).replace(/[^A-Za-z0-9._/-]/g, '?');

/** Parses argv into { positional, flags } or { error }. Unknown flags are errors. */
export function parseArgs(argv, { values = [], bools = [] }) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (bools.includes(name)) {
      flags[name] = true;
    } else if (values.includes(name)) {
      if (i + 1 >= argv.length) return { error: 'A flag is missing its value.' };
      flags[name] = argv[++i];
    } else {
      return { error: 'Unknown flag.' };
    }
  }
  return { positional, flags };
}

/** Reads the intake at root; returns { ok, text } or { ok:false, code, message }. */
export function readIntakeFile(root) {
  const path = join(root, INTAKE_FILE);
  // Never read or write through a symlinked docs/ or docs/project/.
  for (const dir of [join(root, 'docs'), dirname(path)]) {
    try {
      if (lstatSync(dir).isSymbolicLink()) return { ok: false, code: 1, message: MESSAGES.symlinkIntake };
    } catch {
      return { ok: false, code: 1, message: MESSAGES.noIntake };
    }
  }
  let info;
  try {
    info = lstatSync(path);
  } catch {
    return { ok: false, code: 1, message: MESSAGES.noIntake };
  }
  if (info.isSymbolicLink() || !info.isFile()) return { ok: false, code: 1, message: MESSAGES.symlinkIntake };
  try {
    return { ok: true, text: readFileSync(path, 'utf8'), path };
  } catch {
    return { ok: false, code: 1, message: MESSAGES.noIntake };
  }
}

// ---- status ---------------------------------------------------------------

const decisionPath = (path) => (typeof path === 'string' && DECISION_PATH.test(path) ? path : null);

function needsDecision(q6) {
  return q6.state === 'dont-know' || (Array.isArray(q6.data) && q6.data.some((id) => SENSITIVE_IDS.has(id)));
}

/**
 * intake: parsed intake value. gate: the dataGate result.
 * -> { gate, line, next, open, followUps }, groups keyed by part.
 */
export function intakeStatus(intake, gate) {
  const open = Object.fromEntries(GROUPS.map((g) => [g, []]));
  const followUps = Object.fromEntries(GROUPS.map((g) => [g, []]));
  const byId = new Map(intake.questions.map((q) => [q.id, q]));
  byId.set('setup', intake.setup);

  const blocked = gate?.blocked !== false;
  const q6At = ASK_ORDER.indexOf('Q6');
  let next = null;
  let stopped = false;
  ASK_ORDER.forEach((id, index) => {
    const item = byId.get(id);
    const group = item.part;
    const label = id === 'setup' ? 'confirmation' : id;
    if (item.state === 'open') {
      open[group].push(label);
      if (next === null && !stopped) next = id;
    } else if (item.state === 'dont-know') {
      followUps[group].push(label);
    }
    if (blocked && index === q6At && next === null) stopped = true;
  });

  let line;
  if (blocked) {
    const path = decisionPath(gate?.decision);
    const reason = GATE_REASONS.has(gate?.reason) ? gate.reason : 'blocked';
    line = `BLOCKED: awaiting decision${path ? ` ${path}` : ''} (${reason})`;
  } else {
    const q6 = byId.get('Q6');
    const path = decisionPath(q6.decision);
    line = needsDecision(q6) && path ? `READY: ${path} says build` : 'READY: no decision needed';
  }

  const ticked = Array.isArray(byId.get('Q6')?.data) ? byId.get('Q6').data : [];
  // While blocked, the stop message takes over; the note would wrongly reassure.
  const note = !blocked && ticked.some((id) => PERSONAL_DETAILS.includes(id)) ? PERSONAL_NOTE : null;

  let nextText;
  if (next !== null) nextText = next;
  else if (blocked) nextText = 'none (raise /escalate before asking Q5)';
  else nextText = 'none (nothing left to ask)';
  return { gate, line, next: next ?? nextText, note, open, followUps };
}

function groupLines(heading, groups) {
  const used = GROUPS.filter((g) => groups[g].length > 0);
  if (used.length === 0) return [];
  return [heading, ...used.map((g) => `  ${g}: ${groups[g].join(', ')}`)];
}

/** The one status format: gate line, Next line, then the open groups and follow-ups. */
export function statusLines(status) {
  return [
    status.line,
    `Next: ${status.next}`,
    ...(status.note ? [status.note] : []),
    ...groupLines('Still open', status.open),
    ...groupLines('Follow-ups (answered "don\'t know")', status.followUps),
  ];
}

function runStatus(root, flags, readMain) {
  const file = readIntakeFile(root);
  if (!file.ok) return { code: file.code, out: '', err: file.message + '\n' };
  const parsed = parseIntake(file.text);
  if (!parsed.ok) return { code: 1, out: '', err: MESSAGES.invalidIntake + '\n' };

  let gate;
  try {
    gate = dataGate(parsed.value, { readMain });
  } catch {
    gate = { blocked: true, decision: null, reason: 'blocked' };
  }
  const status = intakeStatus(parsed.value, gate);
  const code = gate.blocked === false ? 0 : 3;
  if (flags.json) {
    const body = {
      status: code === 0 ? 'READY' : 'BLOCKED',
      line: status.line,
      next: status.next,
      note: status.note,
      open: status.open,
      followUps: status.followUps,
    };
    return { code, out: JSON.stringify(body, null, 2) + '\n', err: '' };
  }
  return { code, out: statusLines(status).join('\n') + '\n', err: '' };
}

// ---- validate -------------------------------------------------------------

function kindsIn(text) {
  return [...new Set(findIdentifiers(text).map((m) => m.kind))];
}

function addWarnings(warnings, file, question, text) {
  for (const kind of kindsIn(text)) warnings.push({ file, question, kind });
}

/** Text outside the onboard blocks of an intake (title, prose). */
function outsideBlocks(text) {
  const out = [];
  let inside = false;
  for (const line of text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^<!-- onboard:/.test(line)) inside = true;
    else if (/^<!-- \/onboard:/.test(line)) inside = false;
    else if (!inside) out.push(line);
  }
  return out.join('\n');
}

function scanIntake(root, errors, warnings) {
  const file = readIntakeFile(root);
  if (!file.ok) return void errors.push(`${INTAKE_FILE}: ${file.message}`);
  const parsed = parseIntake(file.text);
  if (!parsed.ok) return void errors.push(`${INTAKE_FILE}: ${MESSAGES.invalidIntake}`);
  const { questions, setup, flags } = parsed.value;
  const blocks = [
    ...questions.map((q) => ({ id: q.id, text: q.answer, madeUp: q.madeUp })),
    { id: 'setup', text: setup.summary, madeUp: setup.madeUp },
    { id: 'flags', text: flags.answer, madeUp: flags.madeUp },
  ];
  for (const b of blocks) {
    if (!b.madeUp) addWarnings(warnings, INTAKE_FILE, b.id, b.text);
  }
  addWarnings(warnings, INTAKE_FILE, 'intake', outsideBlocks(file.text));
}

function scanDirectory(root, rel, errors, warnings) {
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch {
    return void errors.push(`Cannot read ${safeName(rel)}.`);
  }
  for (const entry of entries) {
    const path = `${rel}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      errors.push(`A symbolic link is not allowed in docs/project: ${safeName(path)}`);
    } else if (entry.isDirectory()) {
      scanDirectory(root, path, errors, warnings);
    } else if (entry.isFile()) {
      if (path === INTAKE_FILE) continue;
      try {
        const buffer = readFileSync(join(root, path));
        if (buffer.length > MAX_FILE_BYTES) errors.push(`File is too large to check: ${safeName(path)}`);
        else addWarnings(warnings, safeName(path), null, buffer.toString('utf8'));
      } catch {
        errors.push(`Cannot read ${safeName(path)}.`);
      }
    } else {
      errors.push(`Unsupported file type in docs/project: ${safeName(path)}`);
    }
  }
}

function scanProject(root, errors, warnings) {
  for (const dir of ['docs', PROJECT_DIR]) {
    let info;
    try {
      info = lstatSync(join(root, dir));
    } catch {
      return;
    }
    if (info.isSymbolicLink()) return void errors.push(`A symbolic link is not allowed: ${dir}`);
    if (!info.isDirectory()) return void errors.push(`${dir} is not a directory.`);
  }
  let intakeThere = true;
  try {
    lstatSync(join(root, INTAKE_FILE));
  } catch {
    intakeThere = false;
  }
  if (intakeThere) scanIntake(root, errors, warnings);
  scanDirectory(root, PROJECT_DIR, errors, warnings);
}

function scanClaudeMd(root, errors, warnings) {
  let info;
  try {
    info = lstatSync(join(root, 'CLAUDE.md'));
  } catch {
    return;
  }
  if (info.isSymbolicLink() || !info.isFile()) return void errors.push('CLAUDE.md must be a regular file.');
  const text = readFileSync(join(root, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');
  const count = (needle) => text.split(needle).length - 1;
  const starts = count(SECTION_MARKERS.start);
  const ends = count(SECTION_MARKERS.end);
  if (starts === 0 && ends === 0) return;
  const from = text.indexOf(SECTION_MARKERS.start);
  const to = text.indexOf(SECTION_MARKERS.end);
  if (starts !== 1 || ends !== 1 || from > to) return void errors.push('The CLAUDE.md onboard markers are malformed.');
  addWarnings(warnings, 'CLAUDE.md', null, text.slice(from + SECTION_MARKERS.start.length, to));
}

/**
 * Scans the intake, every other file under docs/project/ and the CLAUDE.md
 * onboard section. -> { errors: string[], warnings: [{ file, question, kind }] }.
 * `strict` changes only the CLI exit code, not what is found.
 */
export function validateProject(root, { strict } = {}) {
  void strict;
  const errors = [];
  const warnings = [];
  scanProject(root, errors, warnings);
  scanClaudeMd(root, errors, warnings);
  return { errors, warnings };
}

const KIND_WORDS = {
  email: 'an email address',
  phone: 'a phone number',
  'id-number': 'an ID-like number',
  date: 'a full date',
};

function runValidate(root, flags) {
  const { errors, warnings } = validateProject(root, { strict: Boolean(flags.strict) });
  const code = errors.length > 0 || (flags.strict && warnings.length > 0) ? 1 : 0;
  if (flags.json) return { code, out: JSON.stringify({ errors, warnings }, null, 2) + '\n', err: '' };
  const lines = [
    ...errors.map((e) => `ERROR: ${e}`),
    ...warnings.map((w) => {
      const where = w.question ? `${w.file} ${w.question}` : w.file;
      return (
        `${flags.strict ? 'ERROR' : 'WARN'}: ${where} looks like ${KIND_WORDS[w.kind] ?? 'an identifier'}. ` +
        'If it is made up, record it again with --made-up. Otherwise remove it.'
      );
    }),
  ];
  const out = lines.length > 0 ? lines.join('\n') + '\n' : 'No problems found.\n';
  return { code, out, err: '' };
}

// ---- entry ----------------------------------------------------------------

/** Runs the CLI without touching process state. -> { code, out, err } */
export function runCheck(argv, { readMain } = {}) {
  try {
    const parsed = parseArgs(argv, { values: ['root'], bools: ['json', 'strict'] });
    if (parsed.error) return { code: 2, out: '', err: parsed.error + '\n' + USAGE };
    const { positional, flags } = parsed;
    const [command, ...rest] = positional;
    if ((command !== 'status' && command !== 'validate') || rest.length > 0) {
      return { code: 2, out: '', err: USAGE };
    }
    if (command === 'status' && flags.strict) return { code: 2, out: '', err: USAGE };
    const root = resolve(flags.root ?? process.cwd());
    if (command === 'validate') return runValidate(root, flags);
    return runStatus(root, flags, readMain ?? ((path) => readFromOriginMain(root, path)));
  } catch {
    return { code: 1, out: '', err: MESSAGES.unexpected + '\n' };
  }
}

const USAGE =
  'Usage:\n  node tools/onboard/check.mjs status   [--root DIR] [--json]\n' +
  '  node tools/onboard/check.mjs validate [--root DIR] [--strict] [--json]\n';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runCheck(process.argv.slice(2));
  process.stdout.write(result.out);
  process.stderr.write(result.err);
  process.exitCode = result.code;
}
