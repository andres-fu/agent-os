// The team diagram for /onboard: a Mermaid flowchart plus a numbered text
// version that says the same thing (AC-13). The text version is not optional:
// some people cannot form or hold a mental image.
//
// Rules this file keeps (docs/specs/2026-10-11-onboard-plan.md, "Shared conventions"):
//  - No file-derived text in output: role names are cut down to [A-Za-z0-9._-]
//    for display, and Mermaid node ids to [a-z0-9_].
//  - A bad agent file is skipped, never thrown on and never echoed.
// No dependencies: Node 20+.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../lessons/lessons.mjs';

const PERSON = 'the person with the problem';
const STAKEHOLDER = 'the stakeholder';
const MAX_AGENT_BYTES = 256 * 1024;
// Words Mermaid reads as syntax when they stand alone as a node id.
const RESERVED_IDS = new Set(['end', 'graph', 'flowchart', 'subgraph', 'style', 'class', 'click', 'default', 'person', 'stakeholder']);

// The real flow. `from`/`to` are role names, or 'person' / 'stakeholder'.
// An edge is drawn only when both ends are on the team. `dotted` marks advice
// or a review that only applies sometimes.
const FLOW = [
  { from: 'person', to: 'product-manager', label: 'talks to', verb: 'talks to' },
  { from: 'product-manager', to: 'engineering-manager', label: 'spec', verb: 'hands the spec to' },
  { from: 'engineering-manager', to: 'developer', label: 'plan', verb: 'gives the plan to' },
  { from: 'developer', to: 'qa', label: 'code and tests', verb: 'hands the code and tests to' },
  { from: 'qa', to: 'principal-engineer', label: 'reviews', verb: 'sends tested work to', tail: ', who reviews every pull request' },
  { from: 'qa', to: 'security-compliance', label: 'reviews when it applies', verb: 'sends work that touches sensitive areas to', tail: ', who reviews it and can block a merge', dotted: true },
  { from: 'principal-engineer', to: 'stakeholder', label: 'approved work', verb: 'passes approved work to', tail: ', who decides and merges' },
  { from: 'ux-reviewer', to: 'developer', label: 'advises', verb: 'advises', tail: ' on screens and wording, and never blocks a merge', dotted: true },
];

/** Keeps only [A-Za-z0-9._-]; everything else becomes "-". */
const displayName = (name) => String(name).replace(/[^A-Za-z0-9._-]/g, '-');

/** Reads the `name:` of every `*.md` in `agentsDir`, sorted. Skips bad files; never throws. */
export function readRoles(agentsDir) {
  let entries;
  try {
    entries = readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    try {
      const text = readFileSync(join(agentsDir, entry.name), 'utf8');
      if (text.length > MAX_AGENT_BYTES) continue;
      const parsed = parseFrontmatter(text);
      const name = parsed.ok ? parsed.value.fields.name : undefined;
      if (typeof name === 'string' && name.trim() !== '') names.push(name.trim());
    } catch {
      // A bad file is skipped; its content is never reported.
    }
  }
  return [...new Set(names)].sort();
}

/** Node ids: [a-z0-9_] only, never reserved, never repeated. */
function assignIds(roles) {
  const used = new Set(['person', 'stakeholder']);
  const ids = new Map();
  for (const role of roles) {
    let id = String(role).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
    if (RESERVED_IDS.has(id)) id += '_role';
    let unique = id;
    for (let n = 2; used.has(unique); n++) unique = `${id}_${n}`;
    used.add(unique);
    ids.set(role, unique);
  }
  return ids;
}

/** Returns the Mermaid block followed by the numbered text version. `roles` is a list of role names. */
export function renderTeam({ roles } = {}) {
  if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string')) {
    throw new Error('roles must be a list of role names');
  }
  const team = [...new Set(roles)];
  const ids = assignIds(team);
  const idOf = (end) => (end === 'person' || end === 'stakeholder' ? end : ids.get(end));
  const nameOf = (end) => (end === 'person' ? PERSON : end === 'stakeholder' ? STAKEHOLDER : displayName(end));
  const edges = FLOW.filter((e) => [e.from, e.to].every((end) => end === 'person' || end === 'stakeholder' || ids.has(end)));

  const mermaid = ['flowchart TD', `  person["${PERSON}"]`, `  stakeholder["${STAKEHOLDER}"]`];
  for (const role of team) mermaid.push(`  ${ids.get(role)}["${displayName(role)}"]`);
  for (const e of edges) {
    const arrow = e.dotted ? `-.->|${e.label}|` : `-->|${e.label}|`;
    mermaid.push(`  ${idOf(e.from)} ${arrow} ${idOf(e.to)}`);
  }

  const steps = edges.map((e) => `${nameOf(e.from)} ${e.verb} ${nameOf(e.to)}${e.tail ?? ''}.`);
  const inFlow = new Set(edges.flatMap((e) => [e.from, e.to]));
  const others = team.filter((r) => !inFlow.has(r)).map(displayName);
  if (others.length > 0) steps.push(`Also on the team: ${others.join(', ')}.`);

  return [
    '```mermaid',
    ...mermaid,
    '```',
    '',
    'Text version of the same diagram, in order:',
    '',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
  ].join('\n');
}
