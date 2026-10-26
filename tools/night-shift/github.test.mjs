import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeGh } from './github.mjs';

function fake(stdout) {
  const calls = [];
  const execFile = async (file, args, options) => {
    calls.push({ file, args, options });
    if (stdout instanceof Error) throw stdout;
    return { stdout, stderr: '' };
  };
  return { calls, gh: makeGh({ execFile }) };
}

test('json runs gh with array arguments, no shell, and a 30-second timeout', async () => {
  const { calls, gh } = fake('[{"number":1}]');
  assert.deepEqual(await gh.json(['pr', 'list', '--json', 'number']), [{ number: 1 }]);
  assert.equal(calls[0].file, 'gh');
  assert.deepEqual(calls[0].args, ['pr', 'list', '--json', 'number']);
  assert.equal(calls[0].options.timeout, 30_000);
  assert.notEqual(calls[0].options.shell, true);
});

test('a failed gh call throws', async () => {
  const { gh } = fake(new Error('HTTP 401: Bad credentials'));
  await assert.rejects(gh.json(['pr', 'list']), /401/);
});

test('output that is not JSON throws', async () => {
  const { gh } = fake('<html>rate limited</html>');
  await assert.rejects(gh.json(['pr', 'list']), /not JSON/);
});

test('pages flattens a paginated, slurped list', async () => {
  const { calls, gh } = fake('[[{"n":1},{"n":2}],[{"n":3}]]');
  assert.deepEqual(await gh.pages('repos/a/b/issues'), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(calls[0].args, ['api', '--paginate', '--slurp', 'repos/a/b/issues']);
});

// /installation/repositories pages are { total_count, repositories: [...] }.
test('pages can take the list from a key of each page', async () => {
  const { gh } = fake('[{"total_count":3,"repositories":[{"n":1},{"n":2}]},{"total_count":3,"repositories":[{"n":3}]}]');
  assert.deepEqual(await gh.pages('installation/repositories', { key: 'repositories' }), [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test('pages with a key throws when a page has no list there', async () => {
  const { gh } = fake('[{"message":"Bad credentials"}]');
  await assert.rejects(gh.pages('installation/repositories', { key: 'repositories' }), /not a list/);
});

test('pages throws when the pages are not lists', async () => {
  const { gh } = fake('[{"message":"Not Found"}]');
  await assert.rejects(gh.pages('repos/a/b/issues'), /not a list/);
});

// -F would read a value starting with @ as a file; -f never does.
test('graphql passes the query and variables as raw strings with -f', async () => {
  const { calls, gh } = fake('{"data":{"repository":{"issue":{"lastEditedAt":null}}}}');
  const data = await gh.graphql('query($owner:String!){x}', { owner: '@etc/passwd' });
  assert.deepEqual(data, { repository: { issue: { lastEditedAt: null } } });
  assert.deepEqual(calls[0].args, ['api', 'graphql', '-f', 'query=query($owner:String!){x}', '-f', 'owner=@etc/passwd']);
});

test('graphql errors in the response throw', async () => {
  const { gh } = fake('{"data":null,"errors":[{"message":"Could not resolve"}]}');
  await assert.rejects(gh.graphql('query{x}', {}), /graphql/);
});
