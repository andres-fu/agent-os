// The /review skill's checker (.claude/skills/review/). It checks a reviewer's
// draft against the output contract in its role: exactly one verdict in that
// role's own words, at least one *observed* label, the hand-off note, and the
// word limit. Reviewers can't write files, so the draft comes on stdin:
//
//   node tools/review/check-review.mjs --role principal <<'EOF'
//   ...the draft review...
//   EOF
//
// Prints "ok: review" and exits 0, or one problem per line and exits 1.
// Exit 2 is a usage error. No dependencies: Node 20+.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verdicts are bold, optionally after "Verdict:", as the role files ask.
const ROLES = {
  principal: {
    limit: 400,
    verdicts: /\*\*(?:Verdict:\s*)?(?:Approve|Request changes|Escalate)\.?\*\*/g,
    words: 'Approve, Request changes or Escalate',
  },
  security: {
    limit: 350,
    verdicts: /\*\*(?:Verdict:\s*)?(?:Pass with advice|Pass|Block)\.?\*\*/g,
    words: 'Pass, Pass with advice or Block',
  },
};

/** Problems with a draft review, as plain sentences; an empty list means it passes. */
export function checkReview(text, { role }) {
  const rules = ROLES[role];
  if (!rules) throw new Error(`unknown role "${role}": use principal or security`);
  const problems = [];
  const verdicts = text.match(rules.verdicts) ?? [];
  if (verdicts.length !== 1) {
    problems.push(`give exactly one verdict in bold (${rules.words}); found ${verdicts.length}`);
  }
  if (!/\*observed\*/i.test(text)) {
    problems.push('label at least one point *observed*, with file:line, a link or output');
  }
  if (!/^#*\s*\**Hand-off\b/im.test(text)) {
    problems.push('end with the Hand-off note (docs/team/roles.md)');
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > rules.limit) {
    problems.push(`at most ${rules.limit} words, hand-off included; this is ${words}`);
  }
  return problems;
}

function main(args) {
  const at = args.indexOf('--role');
  const role = at === -1 ? undefined : args[at + 1];
  if (!ROLES[role]) {
    process.stderr.write('usage: node tools/review/check-review.mjs --role principal|security < review.md\n');
    return 2;
  }
  const problems = checkReview(readFileSync(0, 'utf8'), { role });
  if (problems.length === 0) {
    process.stdout.write('ok: review\n');
    return 0;
  }
  for (const problem of problems) process.stdout.write(`review: ${problem}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
