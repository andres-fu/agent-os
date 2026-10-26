// The picker's only way to GitHub: the `gh` command, run with array
// arguments (never a shell) and a 30-second timeout. `execFile` is injected
// so tests can fake it. Any failure throws; the picker turns a throw into a
// stop, never into an empty list.

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 64 * 1024 * 1024;

export function makeGh({ execFile = promisify(execFileCallback) } = {}) {
  async function json(args) {
    const { stdout } = await execFile('gh', args, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true });
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(`gh ${args[0]} output is not JSON`);
    }
  }

  /**
   * Every page of a REST list, read with --paginate --slurp, as one list.
   * `key` names the list inside each page, for endpoints that wrap it.
   */
  async function pages(path, { key } = {}) {
    const result = await json(['api', '--paginate', '--slurp', path]);
    const lists = Array.isArray(result) ? result.map((page) => (key ? page?.[key] : page)) : null;
    if (!lists || !lists.every(Array.isArray)) throw new Error(`gh api ${path}: not a list`);
    return lists.flat();
  }

  /** Variables go with -f, a raw string: -F would read "@file" values. */
  async function graphql(query, vars) {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [key, value] of Object.entries(vars)) args.push('-f', `${key}=${value}`);
    const result = await json(args);
    if (result.errors?.length || !result.data) throw new Error('gh api graphql returned errors');
    return result.data;
  }

  return { json, pages, graphql };
}
