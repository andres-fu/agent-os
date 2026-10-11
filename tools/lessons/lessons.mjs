// The lessons ledger: one Markdown file per lesson, with a small frontmatter
// block. Every lesson must point at evidence (a link or a commit), so the team
// can only "learn" things that verifiably happened.
//
//   node tools/lessons/lessons.mjs check [dir...]
//   node tools/lessons/lessons.mjs index [dir...] [--out FILE]
//
// With no dir, docs/lessons is used. Several dirs combine lessons from several
// projects into one index. No dependencies: Node 20+.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = ['mistake', 'practice', 'tool-quirk', 'research'];
export const STATUSES = ['adopted', 'proposed', 'retired'];
export const ENFORCERS = ['gate', 'hook', 'agent-rule', 'none'];
const REQUIRED = ['id', 'title', 'date', 'project', 'kind', 'status', 'rule', 'evidence'];

const ID_PATTERN = /^L-\d{4}$/;
const COMMIT_PATTERN = /^commit:[0-9a-f]{7,40}$/;
const FIELD_PATTERN = /^([a-z_]+):\s*(.*)$/;
const LIST_ITEM_PATTERN = /^\s+-\s+(.+)$/;

const ok = (value) => ({ ok: true, value });
const fail = (error) => ({ ok: false, error });

function unquote(text) {
  const t = text.trim();
  const quoted = t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0];
  return quoted ? t.slice(1, -1) : t;
}

/**
 * Parses the restricted frontmatter a lesson uses: `key: value` scalars and
 * `key:` followed by indented `- item` lines. Anything else is an error with
 * its line number, so a typo is never silently dropped.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return fail('a lesson must start with --- on its first line');

  const end = lines.indexOf('---', 1);
  if (end === -1) return fail('no closing --- after the frontmatter');

  const fields = {};
  let listKey = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (line.trim() === '') continue;

    const item = LIST_ITEM_PATTERN.exec(line);
    if (item) {
      if (listKey === null) return fail(`line ${lineNo}: list item without a key above it`);
      fields[listKey].push(unquote(item[1]));
      continue;
    }

    const field = FIELD_PATTERN.exec(line);
    if (!field) return fail(`line ${lineNo}: expected "key: value" or "  - item", got "${line}"`);

    const [, key, raw] = field;
    if (Object.hasOwn(fields, key)) return fail(`line ${lineNo}: duplicate key "${key}"`);
    if (raw.trim() === '') {
      fields[key] = [];
      listKey = key;
    } else {
      fields[key] = unquote(raw);
      listKey = null;
    }
  }

  return ok({ fields, body: lines.slice(end + 1).join('\n') });
}

function isCalendarDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

function isEvidence(item) {
  if (COMMIT_PATTERN.test(item)) return true;
  try {
    return new URL(item).protocol === 'https:';
  } catch {
    return false;
  }
}

function asList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Returns every problem with one lesson's fields; an empty list means valid. */
export function validateLesson(fields, fileName) {
  const errors = [];
  const missing = (key) => {
    const value = fields[key];
    return value === undefined || (typeof value === 'string' && value.trim() === '');
  };

  for (const key of REQUIRED) {
    if (key !== 'evidence' && missing(key)) errors.push(`missing "${key}"`);
  }

  const evidence = asList(fields.evidence);
  if (evidence.length === 0) {
    errors.push('missing "evidence": a lesson needs at least one evidence link or commit');
  }
  for (const item of evidence) {
    if (!isEvidence(item)) {
      errors.push(`"evidence" item "${item}" is not an https link or commit:<sha>`);
    }
  }

  if (!missing('id')) {
    if (!ID_PATTERN.test(fields.id)) errors.push(`"id" must look like L-0001, got "${fields.id}"`);
    else if (!fileName.startsWith(`${fields.id}-`)) {
      errors.push(`file name must start with "${fields.id}-", got "${fileName}"`);
    }
  }
  if (!missing('date') && !isCalendarDate(fields.date)) {
    errors.push(`"date" must be a real YYYY-MM-DD date, got "${fields.date}"`);
  }
  if (!missing('kind') && !KINDS.includes(fields.kind)) {
    errors.push(`"kind" must be one of ${KINDS.join(', ')}, got "${fields.kind}"`);
  }
  if (!missing('status') && !STATUSES.includes(fields.status)) {
    errors.push(`"status" must be one of ${STATUSES.join(', ')}, got "${fields.status}"`);
  }
  if (fields.enforced_by !== undefined && !ENFORCERS.includes(fields.enforced_by)) {
    errors.push(`"enforced_by" must be one of ${ENFORCERS.join(', ')}, got "${fields.enforced_by}"`);
  }
  if (fields.status === 'adopted' && (fields.enforced_by ?? 'none') === 'none') {
    errors.push('an adopted lesson must say what enforces it: "enforced_by" of gate, hook or agent-rule');
  }

  return errors;
}

function isLessonFile(name) {
  return name.endsWith('.md') && name !== 'README.md' && name !== 'INDEX.md' && !name.startsWith('_');
}

/** Reads and validates every lesson in the given folders (not recursive). */
export function checkLessons(dirs) {
  const lessons = [];
  const errors = [];
  const seen = new Map();

  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(dir).filter((name) => isLessonFile(name) && statSync(join(dir, name)).isFile());
    } catch (cause) {
      errors.push(`${dir}: cannot read lessons folder (${cause.code ?? cause.message})`);
      continue;
    }

    for (const name of names.sort()) {
      const path = join(dir, name);
      const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
      if (!parsed.ok) {
        errors.push(`${path}: ${parsed.error}`);
        continue;
      }

      const problems = validateLesson(parsed.value.fields, name);
      if (problems.length > 0) {
        errors.push(...problems.map((problem) => `${path}: ${problem}`));
        continue;
      }

      const { id, project } = parsed.value.fields;
      const key = `${project}/${id}`;
      if (seen.has(key)) {
        errors.push(`${path}: duplicate id ${id} in project ${project} (also ${seen.get(key)})`);
        continue;
      }
      seen.set(key, path);
      lessons.push({ path, fields: parsed.value.fields });
    }
  }

  return { lessons, errors };
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Renders the ledger as a Markdown index, adopted lessons first. */
export function renderIndex(lessons, { relativeTo }) {
  const out = ['# Lessons index', '', 'Generated by `node tools/lessons/lessons.mjs index`. Do not edit by hand.', ''];
  if (lessons.length === 0) {
    out.push('No lessons yet. Add one with the /retro skill.', '');
    return out.join('\n');
  }

  for (const status of STATUSES) {
    const group = lessons
      .filter((lesson) => lesson.fields.status === status)
      .sort((a, b) => b.fields.date.localeCompare(a.fields.date) || a.fields.id.localeCompare(b.fields.id));
    if (group.length === 0) continue;

    out.push(`## ${status[0].toUpperCase()}${status.slice(1)}`, '');
    out.push('| Lesson | Project | Date | Rule | Enforced by |', '| --- | --- | --- | --- | --- |');
    for (const { path, fields } of group) {
      const link = relative(relativeTo, path).split(sep).join('/');
      out.push(
        `| [${fields.id}](${link}) ${cell(fields.title)} | ${cell(fields.project)} | ${fields.date} | ${cell(fields.rule)} | ${fields.enforced_by ?? 'none'} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

function main(argv) {
  const [command, ...rest] = argv;
  const outIndex = rest.indexOf('--out');
  const outFile = outIndex === -1 ? null : rest[outIndex + 1];
  const dirs = rest.filter((_, i) => outIndex === -1 || (i !== outIndex && i !== outIndex + 1));
  const folders = dirs.length > 0 ? dirs : ['docs/lessons'];

  if (command !== 'check' && command !== 'index') {
    console.error('usage: lessons.mjs check [dir...] | index [dir...] [--out FILE]');
    return 2;
  }
  if (outIndex !== -1 && !outFile) {
    console.error('--out needs a file path');
    return 2;
  }

  const { lessons, errors } = checkLessons(folders);
  for (const error of errors) console.error(error);
  if (errors.length > 0) {
    console.error(`${errors.length} problem(s) in the lessons ledger`);
    return 1;
  }

  if (command === 'check') {
    console.log(`${lessons.length} lesson(s), all with evidence`);
    return 0;
  }

  const target = outFile ?? join(folders[0], 'INDEX.md');
  writeFileSync(target, renderIndex(lessons, { relativeTo: dirname(resolve(target)) }));
  console.log(`wrote ${target} (${lessons.length} lesson(s))`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

