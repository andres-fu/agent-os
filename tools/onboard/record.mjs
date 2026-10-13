// The /onboard record command: creates the intake and records answers.
//
//   node tools/onboard/record.mjs create [--root DIR]            # 1 if it exists
//   node tools/onboard/record.mjs record <Q1..Q8|setup|flags> [--root DIR] [--dont-know]
//        [--data id,id] [--decision PATH] [--made-up] [--confirm yes|no] [--answer-file PATH]
//
// Answers come on stdin (or --answer-file, which must be outside the repo),
// never on the command line. `record Q5` exits 3 while the data gate blocks.
// Exit codes: 0 done or unchanged, 1 invalid or refused, 2 usage, 3 BLOCKED.
// No text taken from a file is printed (see check.mjs). Node built-ins only.

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createIntake, parseIntake, recordAnswer, recordSetup } from './intake.mjs';
import { dataGate } from './data-gate.mjs';
import { readFromOriginMain } from './git-main.mjs';
import { INTAKE_FILE, intakeStatus, parseArgs, readIntakeFile, statusLines } from './check.mjs';

const TEMPLATE_FILE = '.claude/skills/onboard/intake-template.md';
const IDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'setup', 'flags'];
const MAX_ANSWER_BYTES = 256 * 1024;

const USAGE =
  'Usage:\n  node tools/onboard/record.mjs create [--root DIR]\n' +
  '  node tools/onboard/record.mjs record <Q1..Q8|setup|flags> [--root DIR] [--dont-know]\n' +
  '       [--data id,id] [--decision PATH] [--made-up] [--confirm yes|no] [--answer-file PATH]\n' +
  'The answer is read from standard input.\n';

const done = (out = '') => ({ code: 0, out, err: '' });
const refuse = (message) => ({ code: 1, out: '', err: message + '\n' });
const usage = (message) => ({ code: 2, out: '', err: (message ? message + '\n' : '') + USAGE });

function create(root) {
  const dir = join(root, 'docs/project');
  for (const d of [join(root, 'docs'), dir]) {
    if (existsSync(d) && lstatSync(d).isSymbolicLink()) return refuse('docs/project must not be a symbolic link.');
  }
  let template;
  try {
    template = readFileSync(join(root, TEMPLATE_FILE), 'utf8');
  } catch {
    return refuse('The intake template was not found.');
  }
  let text;
  try {
    text = createIntake(template);
  } catch {
    return refuse('The intake template is not valid.');
  }
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(root, INTAKE_FILE), text, { flag: 'wx' });
  } catch {
    return refuse('The intake already exists. Nothing was changed.');
  }
  return done('Created the intake.\n');
}

/** Reads an answer file that sits outside the repository. -> { text } or { error } */
function readAnswerFile(root, path) {
  try {
    const rootReal = realpathSync(root);
    const fileReal = realpathSync(resolve(path));
    const rel = relative(rootReal, fileReal);
    const inside = rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
    if (inside) return { error: 'The answer file must be outside the repository.' };
    const info = statSync(fileReal);
    if (!info.isFile() || info.size > MAX_ANSWER_BYTES) return { error: 'The answer file is not a usable file.' };
    return { text: readFileSync(fileReal, 'utf8') };
  } catch {
    return { error: 'The answer file could not be read.' };
  }
}

function runGate(gate, intake, root) {
  try {
    const result = typeof gate === 'function' ? gate(intake, { root }) : null;
    return result && result.blocked === false ? { blocked: false } : (result ?? { blocked: true, decision: null, reason: '' });
  } catch {
    return { blocked: true, decision: null, reason: '' };
  }
}

function record(id, flags, root, stdin, gate) {
  if (!IDS.includes(id)) return usage('That is not a question id.');
  if ((flags.data !== undefined || flags.decision !== undefined) && id !== 'Q6') {
    return usage('--data and --decision apply to Q6 only.');
  }
  if (flags.confirm !== undefined && (id !== 'setup' || !['yes', 'no'].includes(flags.confirm))) {
    return usage('--confirm yes|no applies to setup only.');
  }
  if (flags['dont-know'] && (id === 'setup' || id === 'flags')) return usage('--dont-know does not apply here.');

  const file = readIntakeFile(root);
  if (!file.ok) return refuse(file.message);
  const parsed = parseIntake(file.text);
  if (!parsed.ok) return refuse('The intake is not valid. Fix it, or ask the stakeholder.');

  if (id === 'Q5') {
    const result = runGate(gate, parsed.value, root);
    if (result.blocked !== false) {
      const status = intakeStatus(parsed.value, result);
      return { code: 3, out: statusLines(status).join('\n') + '\n', err: '' };
    }
  }

  // Whether this command needs an answer text at all.
  const wantsText = !flags['dont-know'] && !(id === 'setup' && flags.confirm !== undefined);
  let text = '';
  if (flags['answer-file'] !== undefined) {
    const read = readAnswerFile(root, flags['answer-file']);
    if (read.error) return refuse(read.error);
    text = read.text;
  } else if (wantsText) {
    text = typeof stdin === 'function' ? stdin() : (stdin ?? '');
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_ANSWER_BYTES) return refuse('The answer is missing or too large.');
  }
  const hasText = text.trim() !== '';
  const madeUp = flags['made-up'] ? true : undefined;

  let result;
  if (id === 'setup') {
    if (!hasText && flags.confirm === undefined) return usage('Give a summary on standard input, or --confirm.');
    result = recordSetup(file.text, {
      ...(hasText ? { summary: text } : {}),
      ...(flags.confirm !== undefined ? { confirmed: flags.confirm } : {}),
      madeUp,
    });
  } else {
    const input = { madeUp };
    if (flags['dont-know']) input.dontKnow = true;
    if (hasText) input.answer = text;
    if (id === 'Q6') {
      if (flags.data !== undefined) input.data = flags.data.split(',').filter((x) => x !== '');
      if (flags.decision !== undefined) input.decision = flags.decision;
      if (!hasText && !flags['dont-know'] && flags.data === undefined && flags.decision === undefined && !madeUp) {
        return usage('Give Q6 answers with --data, --decision, --dont-know or standard input.');
      }
    } else if (!hasText && !flags['dont-know']) {
      return usage('Give an answer on standard input, or --dont-know.');
    }
    result = recordAnswer(file.text, id, input);
  }

  if (!result.ok) return refuse(result.error);
  if (!result.changed) return done(`${id} unchanged.\n`);
  writeFileSync(file.path, result.value);
  return done(`Recorded ${id}.\n`);
}

/**
 * Runs the CLI without touching process state. -> { code, out, err }
 * opts: root (default cwd), stdin (string, or a function read only when an answer is needed),
 * gate(intake, { root }) -> the dataGate result, injected.
 */
export function runRecord(argv, { root, stdin, gate } = {}) {
  try {
    const parsed = parseArgs(argv, {
      values: ['root', 'data', 'decision', 'confirm', 'answer-file'],
      bools: ['dont-know', 'made-up'],
    });
    if (parsed.error) return usage(parsed.error);
    const { positional, flags } = parsed;
    const [command, id, ...rest] = positional;
    const where = resolve(flags.root ?? root ?? process.cwd());
    if (command === 'create' && id === undefined) return create(where);
    if (command === 'record' && id !== undefined && rest.length === 0) return record(id, flags, where, stdin, gate);
    return usage();
  } catch {
    return refuse('Unexpected error.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stdin = () => (process.stdin.isTTY ? '' : readFileSync(0, 'utf8'));
  const gate = (intake, { root }) => dataGate(intake, { readMain: (path) => readFromOriginMain(root, path) });
  const result = runRecord(process.argv.slice(2), { stdin, gate });
  process.stdout.write(result.out);
  process.stderr.write(result.err);
  process.exitCode = result.code;
}
