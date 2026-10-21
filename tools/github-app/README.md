# The agents' GitHub identity

Agents act on GitHub as a GitHub App, never as the stakeholder. GitHub can
then tell them apart: the stakeholder approves and merges, and the App is
limited to what it was granted. Commits keep the stakeholder as author, with
`Co-Authored-By: Claude`, so credit and ownership stay with the stakeholder.
Decision: [option D](../../docs/decisions/2026-10-21-public-repo-and-night-shift.md).

`token.mjs` mints the App's installation tokens. Each lasts an hour, and it
caches them until five minutes before they expire:

- `node tools/github-app/token.mjs session-env`: a `SessionStart` hook. It
  writes `GH_TOKEN=<token>` to `CLAUDE_ENV_FILE`, so the session's `gh`
  commands use the App. If it cannot mint a token, it writes
  `GH_TOKEN=unavailable`, so `gh` fails instead of falling back to the
  stakeholder's own login.
- `node tools/github-app/token.mjs credential get`: a git credential helper.
  It gives each `git push` to `https://github.com` a fresh token. If it cannot
  mint one, it gives nothing, and the push fails.

## Set up (once per machine, by the stakeholder)

1. **Create the App** under Settings → Developer settings → GitHub Apps:
   - webhook off;
   - repository permissions: Contents, Issues and Pull requests set to
     **Read and write**, and everything else **No access** (no Actions,
     Administration, Secrets or Workflows);
   - installable **only on this account**.
2. **Generate a private key** and move the `.pem` to `~/.agent-os/`. Never put
   it in a repository.
3. **Install the App** on this repository only. The installation ID is the
   number at the end of the installation page's URL.
4. **Write `~/.agent-os/github-app.json`.** The ids are not secrets:

   ```json
   { "appId": "<App ID>", "installationId": "<installation ID>", "privateKeyPath": "agent-os-app.pem" }
   ```

   `privateKeyPath` is relative to `~/.agent-os/`, unless it is absolute.
5. **Point this checkout's git at the helper.** In the repository folder:

   ```bash
   git config --local credential.https://github.com.helper ""
   git config --local --add credential.https://github.com.helper "!node \"$(pwd)/tools/github-app/token.mjs\" credential"
   ```

   The empty entry clears inherited helpers, such as Git Credential Manager
   with the stakeholder's login. Pushes from this checkout then go as the App,
   your own included. Commit authorship is unchanged.
6. **Add the `SessionStart` hook** to `.claude/settings.json` (shown in the
   PR that added this folder).
7. **Check it:** in a new session, `gh auth status` should report a token from
   `GH_TOKEN`. A push from a branch should show the App, not you, as the
   pusher.

## Known limits
- **Same operating-system user.** Agents run as the stakeholder's Windows or
  macOS user. They could unset `GH_TOKEN`, or read the stakeholder's stored
  `gh` login or the App's key. The App caps what its key can do. A separate
  operating-system user for the night shift would remove the rest.
- **PowerShell needs Claude Code 2.1.296 or later** to receive variables from
  `CLAUDE_ENV_FILE`. Below that, the PowerShell tool's `gh` still uses the
  stakeholder's login (lesson L-0003). Check with `claude --version`.
- **`gh` keeps one token per session.** After an hour it fails, until the
  session is resumed, compacted or restarted. `git push` is never affected,
  because the helper mints a fresh token each time.
- **Scheduled tasks:** the docs do not say whether they run project hooks.
  The night shift checks its identity before it works.
