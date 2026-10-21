// The /plan skill's checker (.claude/skills/plan/). It turns the
// engineering manager's planning rules into something a script can verify:
// required frontmatter and sections, a rejected alternative, routed reviews,
// file ownership per task, and no file shared by two tasks in the same wave
// (tasks in one wave run in parallel, so a shared file means two writers).
//
//   node tools/plan/check.mjs docs/specs/<spec>-plan.md
//
// Prints "ok: <file>" and exits 0, or one problem per line and exits 1.
// Exit 2 is a usage error. No dependencies: Node 20+.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASSIFICATIONS = ['trivial', 'non-trivial'];
const REQUIRED_FIELDS = ['title', 'spec', 'status', 'classification', 'owner', 'date'];
// Headings are matched by prefix, so "What enforces each protection (L-0010)" counts.
const REQUIRED_SECTIONS = [
  'Classification and review',
  'Approach',
  'Interfaces and contracts',
  'Tasks',
  'AC coverage',
  'What enforces each protection',
  'Risks',
];

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return fields;
}

function sections(text) {
  const found = new Map();
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    found.set(heading, newline === -1 ? '' : part.slice(newline + 1));
  }
  return found;
}

function section(found, prefix) {
  for (const [heading, body] of found) {
    if (heading.startsWith(prefix)) return body;
  }
  return null;
}

/**
 * The rows of every task table: a table whose header has Task, Wave and
 * "Files it may change". Each table numbers its own waves (a plan with two
 * PRs has a table per PR, run one after the other), so a row's wave is
 * scoped to its table.
 */
function taskRows(body) {
  const rows = [];
  const lines = body.split('\n');
  let table = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const header = cells(lines[i]);
    const task = header.indexOf('Task');
    const wave = header.indexOf('Wave');
    const files = header.findIndex((cell) => cell.startsWith('Files it may change'));
    if (task === -1 || wave === -1 || files === -1) continue;
    table += 1;
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j += 1) {
      const row = cells(lines[j]);
      const id = (row[task] ?? '').split(/\s+/)[0];
      const paths = [...(row[files] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      rows.push({ id, table, wave: (row[wave] ?? '').trim(), paths });
    }
  }
  return rows;
}

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

/** Problems with a plan, as plain sentences; an empty list means it passes. */
export function checkPlan(planText, { specText }) {
  const text = planText.replace(/\r\n/g, '\n');
  const problems = [];

  const fields = frontmatter(text);
  if (!fields) return ['no frontmatter: the plan starts with a --- block'];
  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) problems.push(`frontmatter: missing ${field}`);
  }
  if (fields.classification && !CLASSIFICATIONS.includes(fields.classification)) {
    problems.push(`frontmatter: classification must be trivial or non-trivial, got "${fields.classification}"`);
  }
  if (fields.owner && fields.owner !== 'engineering-manager') {
    problems.push(`frontmatter: owner must be engineering-manager, got "${fields.owner}"`);
  }
  const specStatus = frontmatter((specText ?? '').replace(/\r\n/g, '\n'))?.status?.split(/\s/)[0];
  if (specStatus !== 'approved') {
    problems.push(`the spec is not approved (status: ${specStatus ?? 'unknown'}); only plan an approved spec`);
  }

  const found = sections(text);
  for (const prefix of REQUIRED_SECTIONS) {
    if (section(found, prefix) === null) problems.push(`missing section: ## ${prefix}`);
  }

  const approach = section(found, 'Approach');
  if (approach !== null && !/\brejected\b/i.test(approach)) {
    problems.push('Approach: name a rejected alternative, and why ("Rejected: ...")');
  }

  const review = section(found, 'Classification and review');
  if (review !== null) {
    if (fields.classification === 'non-trivial' && !/principal-engineer/.test(review)) {
      problems.push('Classification and review: a non-trivial plan goes to principal-engineer before coding');
    }
    if (!/security-compliance|security review:\s*(yes|no|not triggered)/i.test(review)) {
      problems.push('Classification and review: say whether security-compliance reviews it ("Security review: yes / no / not triggered")');
    }
  }

  const tasks = section(found, 'Tasks');
  if (tasks !== null) {
    const rows = taskRows(tasks);
    if (rows.length === 0) problems.push('Tasks: no task table (columns Task, Wave, "Files it may change")');
    const owner = new Map();
    for (const row of rows) {
      if (row.paths.length === 0) problems.push(`Tasks: ${row.id} names no files it may change`);
      for (const path of row.paths) {
        const key = `${row.table}\n${row.wave}\n${path}`;
        const first = owner.get(key);
        if (first && first !== row.id) {
          problems.push(`Tasks: ${first} and ${row.id} both change ${path} in wave ${row.wave}; parallel tasks may not share a file`);
        } else {
          owner.set(key, row.id);
        }
      }
    }
  }
  return problems;
}

function main(args) {
  const [planPath] = args;
  if (!planPath) {
    process.stderr.write('usage: node tools/plan/check.mjs <plan.md>\n');
    return 2;
  }
  let planText;
  try {
    planText = readFileSync(planPath, 'utf8');
  } catch {
    process.stdout.write(`${planPath}: cannot read the plan\n`);
    return 1;
  }
  // The spec field may carry a note after the path: "docs/specs/x.md (status: approved, ...)".
  const specPath = (frontmatter(planText.replace(/\r\n/g, '\n'))?.spec ?? '').split(/\s/)[0];
  let specText = '';
  try {
    specText = specPath ? readFileSync(specPath, 'utf8') : '';
  } catch {
    specText = '';
  }
  const problems = checkPlan(planText, { specText });
  if (problems.length === 0) {
    process.stdout.write(`ok: ${planPath}\n`);
    return 0;
  }
  for (const problem of problems) process.stdout.write(`${planPath}: ${problem}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
