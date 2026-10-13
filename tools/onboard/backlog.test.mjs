import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBacklog, validateBacklog } from './backlog.mjs';

const slice = (n, next = false) => ({
  text: `Build part ${n} of the reading app.`,
  doneWhen: `part ${n} opens on a tablet`,
  next,
});
const slices = (count, nextAt = 0) => Array.from({ length: count }, (_, i) => slice(i + 1, i === nextAt));

const lineOf = (text) => text.split('\n');

test('two [next] slices is an error', () => {
  const text = [
    '- [next] Build part 1 of the reading app.',
    '  Done when: part 1 opens on a tablet.',
    '- [next] Build part 2 of the reading app.',
    '  Done when: part 2 opens on a tablet.',
    '- [ ] Build part 3 of the reading app.',
    '  Done when: part 3 opens on a tablet.',
    '',
  ].join('\n');
  assert.deepEqual(validateBacklog(text).errors, ['backlog-next-count']);
  assert.throws(() => renderBacklog(slices(3).map((s) => ({ ...s, next: true }))), /exactly one/);
});

test('a rendered backlog validates, with one [next] line', () => {
  for (const n of [3, 5, 7]) {
    const text = renderBacklog(slices(n, 1));
    assert.deepEqual(validateBacklog(text).errors, []);
    assert.equal(lineOf(text).filter((l) => l.startsWith('- [next] ')).length, 1);
    assert.equal(lineOf(text).filter((l) => l.startsWith('  Done when: ')).length, n);
  }
});

test('render is deterministic and ends with a newline', () => {
  assert.equal(renderBacklog(slices(3)), renderBacklog(slices(3)));
  assert.ok(renderBacklog(slices(3)).endsWith('\n'));
});

test('fewer than 3 or more than 7 slices is an error', () => {
  for (const n of [0, 2, 8]) {
    assert.throws(() => renderBacklog(slices(n)), /3 to 7/);
  }
  const two = renderBacklog(slices(3)).split('\n').slice(0, 4).join('\n') + '\n';
  assert.ok(validateBacklog(two).errors.includes('backlog-slice-count'));
});

test('a slice needs one plain sentence and a non-empty done when', () => {
  const bad = [
    { text: 'Two. Sentences.' },
    { text: 'No full stop' },
    { text: '' },
    { text: 'Is it a question?' },
    { text: 'Line one.\nLine two.' },
    { doneWhen: '' },
    { doneWhen: '   ' },
    { doneWhen: 'two\nlines' },
    { text: 42 },
  ];
  for (const change of bad) {
    const input = slices(3);
    input[1] = { ...input[1], ...change };
    assert.throws(() => renderBacklog(input), /slice 2/, JSON.stringify(change));
  }
});

test('input that is not a list of slices is an error', () => {
  for (const input of [null, undefined, 'x', {}, [null, null, null], [1, 2, 3]]) {
    assert.throws(() => renderBacklog(input), Error);
  }
  assert.throws(() => renderBacklog(slices(3).map((s) => ({ ...s, next: 'yes' }))), Error);
});

test('a date or id in a slice is refused with a fixed message, never echoed', () => {
  for (const bad of ['2026-11-01', '11/01/2026', 'Nov 1, 2026', 'jo@example.com', '123-45-6789']) {
    for (const field of ['text', 'doneWhen']) {
      const input = slices(4);
      input[2] = { ...input[2], [field]: field === 'text' ? `Send the note on ${bad}.` : `sent on ${bad}` };
      assert.throws(
        () => renderBacklog(input),
        (e) => {
          assert.match(e.message, /Remove the date or ID from slice 3; write 'week 2' instead of a date\./);
          assert.ok(!e.message.includes(bad));
          return true;
        },
      );
    }
  }
  assert.doesNotThrow(() => renderBacklog(slices(3).map((s) => ({ ...s, text: 'Ship it in week 2.' }))));
});

test('validate flags a dated line without echoing it', () => {
  const text = renderBacklog(slices(3)).replace('part 2 opens on a tablet', 'sent by 2026-11-01');
  const { errors } = validateBacklog(text);
  assert.deepEqual(errors, ['backlog-date-or-id']);
  assert.ok(!errors.join().includes('2026'));
});

test('validate reports fixed errors for stray lines and never echoes text', () => {
  const stray = renderBacklog(slices(3)) + '::error::boom\n';
  assert.deepEqual(validateBacklog(stray).errors, ['backlog-line']);
  const noDone = '- [next] Build it.\n- [ ] Build two.\n  Done when: ok.\n- [ ] Build three.\n  Done when: ok.\n';
  assert.deepEqual(validateBacklog(noDone).errors, ['backlog-done-when']);
  const empty = renderBacklog(slices(3)).replace('part 3 opens on a tablet', '');
  assert.deepEqual(validateBacklog(empty).errors, ['backlog-done-when']);
  assert.deepEqual(validateBacklog(42).errors, ['backlog-input']);
});

test('validate reads CRLF and a BOM', () => {
  const text = '﻿' + renderBacklog(slices(3)).replace(/\n/g, '\r\n');
  assert.deepEqual(validateBacklog(text).errors, []);
});
