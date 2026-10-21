// The /spec skill's checker (.claude/skills/spec/). It checks what the product
// manager's procedure promises: the template's frontmatter and sections, every
// acceptance criterion written "Given ..., then ..." so a developer can write a
// failing test from it, the five non-functional areas named, and an approved
// spec saying who approved it.
//
//   node tools/spec/check.mjs docs/specs/<spec>.md
//
// Prints "ok: <file>" and exits 0, or one problem per line and exits 1.
// Exit 2 is a usage error. No dependencies: Node 20+.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUSES = ['draft', 'approved', 'done'];
const REQUIRED_FIELDS = ['title', 'status', 'owner', 'date'];
// Headings match by prefix, so "Out of scope (v2 or later)" counts.
// "Open questions" may be removed once they're all resolved.
const REQUIRED_SECTIONS = ['Problem', 'Goal', 'Acceptance criteria', 'Non-functional requirements', 'Out of scope'];
const NFR_AREAS = ['Security', 'Cost', 'Performance', 'Accessibility', 'Privacy'];

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
  const found = [];
  for (const part of text.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    found.push({
      heading: (newline === -1 ? part : part.slice(0, newline)).trim(),
      body: newline === -1 ? '' : part.slice(newline + 1),
    });
  }
  return found;
}

function section(found, prefix) {
  return found.find((s) => s.heading.startsWith(prefix))?.body ?? null;
}

/** Each criterion is a checkbox item, up to the next checkbox item or sub-heading. */
function criteria(body) {
  return body
    .split(/^(?=- \[[ xX]\] )|^(?=### )/m)
    .filter((block) => /^- \[[ xX]\] /.test(block))
    .map((block) => block.replace(/^- \[[ xX]\] /, '').trim());
}

/** Problems with a spec, as plain sentences; an empty list means it passes. */
export function checkSpec(specText) {
  const text = specText.replace(/\r\n/g, '\n');
  const problems = [];

  const fields = frontmatter(text);
  if (!fields) return ['no frontmatter: the spec starts with a --- block'];
  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) problems.push(`frontmatter: missing ${field}`);
  }
  // The template's status line carries a comment: "draft  # draft | approved | done."
  const status = (fields.status ?? '').split(/\s/)[0];
  if (fields.status && !STATUSES.includes(status)) {
    problems.push(`frontmatter: status must be draft, approved or done, got "${status}"`);
  }
  if (fields.owner && fields.owner !== 'product-manager') {
    problems.push(`frontmatter: owner must be product-manager, got "${fields.owner}"`);
  }
  if (status === 'approved' && !fields.approved_by) {
    problems.push('frontmatter: an approved spec needs approved_by (who, when, and their words)');
  }

  const found = sections(text);
  for (const prefix of REQUIRED_SECTIONS) {
    if (section(found, prefix) === null) problems.push(`missing section: ## ${prefix}`);
  }

  const ac = section(found, 'Acceptance criteria');
  if (ac !== null) {
    const items = criteria(ac);
    if (items.length === 0) problems.push('Acceptance criteria: no acceptance criteria (each is a "- [ ]" item)');
    for (const item of items) {
      if (!(/\bgiven\b/i.test(item) && /\bthen\b/i.test(item))) {
        problems.push(`Acceptance criteria: write it as Given ..., then ...: "${item.split('\n')[0].slice(0, 80)}"`);
      }
    }
  }

  const nfr = section(found, 'Non-functional requirements');
  if (nfr !== null) {
    for (const area of NFR_AREAS) {
      if (!new RegExp(`\\*\\*${area}\\b`).test(nfr)) problems.push(`Non-functional requirements: name ${area}, even if "none"`);
    }
  }
  return problems;
}

function main(args) {
  const [specPath] = args;
  if (!specPath) {
    process.stderr.write('usage: node tools/spec/check.mjs <spec.md>\n');
    return 2;
  }
  let text;
  try {
    text = readFileSync(specPath, 'utf8');
  } catch {
    process.stdout.write(`${specPath}: cannot read the spec\n`);
    return 1;
  }
  const problems = checkSpec(text);
  if (problems.length === 0) {
    process.stdout.write(`ok: ${specPath}\n`);
    return 0;
  }
  for (const problem of problems) process.stdout.write(`${specPath}: ${problem}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
