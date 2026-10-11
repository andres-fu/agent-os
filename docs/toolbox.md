# Toolbox: candidate skills and tools

Tools other people recommend, mapped to the role that would use them. **Nothing
here is adopted yet.** A tool is adopted only after we try it on real work and
record a lesson with evidence (`/retro`), the same rule as the ledger. Most
recommended tools are not worth their context cost; we find out by measuring.

Source of this list: Nate Herk's video on his best Claude repos
(https://www.youtube.com/watch?v=HhZdNYI4pJs). Links were truncated where we got
them; confirm each repository before installing.

| Candidate | Role that would use it | What it might give us | Status |
| --- | --- | --- | --- |
| Claude Security (anthropics) | reviewer, CI | AI security review of each PR, alongside the deterministic scanners | candidate |
| Playwright CLI (microsoft) | qa | Browser smoke tests the agent can drive and CI can run | candidate |
| Addy Osmani's Agent Skills | product-manager, engineering-manager | Planning and spec skills to compare with our templates | candidate |
| Hyperframes (heygen-com) | video pipeline (later product) | Programmatic video editing | candidate |
| Humanizer (blader) | content | Rewrites AI-sounding copy | candidate |
| Supabase Agent Skills | developer | Database and auth patterns, if we use Supabase | candidate |
| Stripe best practices (stripe/ai) | developer, reviewer | Payment integration rules, if we take payments | candidate |
| Expo Skills | developer | Mobile app patterns, if we build mobile | candidate |
| Google Workspace CLI | ops | Docs, Sheets, Gmail from the terminal | candidate |
| Apify MCP Server | research | Web scraping for research tasks (untrusted content: no secrets in that session) | candidate |
| Scrollcraft | ux-reviewer, developer | Website design skill | candidate |
| OpenSEO (every-app) | content | SEO with real data | candidate |

## How to try one
1. Pick one, for one role, on one real task.
2. Compare against the same kind of task without it: time, tokens (`/usage`),
   review findings.
3. Record the result with `/retro`, with links. Adopt or drop it.
