# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

**Languages:** TypeScript, HTML, CSS · **Base branch:** main

**Components:** `src/core` (the pure simulation library: no DOM, no Three.js; type-checked without browser types) · `src/app` (the page: Three.js globe, DOM panels, input). `src/worker` arrives with the Web Worker piece.

**Checks:** `npm run check` (Biome lint and format) · `npm run typecheck` (`tsc -b`; fails if `src/core` touches browser types) · `npm test` (Vitest, run once) · `npm run build` (type-check, then the static build)

**Worktree setup:** `"$(python3 ~/.claude/lib/planner.py tools)/setup-worktree.sh"`, run from the worktree (the tools live on the planner branch, not in the code): runs `npm ci` when `node_modules` is missing or stale, adds the Vitest coverage plugin without touching `package.json` or the lock file, and creates a shared `diff-cover` venv under the repo's git dir. Safe to re-run; `npm ci` removes the coverage plugin, so re-run this after it.

**Coverage:** `"$(python3 ~/.claude/lib/planner.py tools)/coverage-changed.sh" [<base>]` (default `main`, compared as `origin/<base>` when that exists): runs Vitest under v8 coverage, then `diff-cover` lists the changed lines no test runs, uncommitted edits to tracked files included (untracked files are not seen). Reports go under the worktree's git dir. Exits 1 only when the test run fails, 2 when the tooling or base branch is missing.

**Commit style:** default (see git.md).

## Instructions

- Purpose is worldbuilding: believable results and a fast-running simulation matter more than physical fidelity.
- The app runs entirely in the browser as static files, with no server.
- Formatting and linting belong to Biome; do not add ESLint or Prettier.
- GitHub remote: `principalfish/earthsim` (private). The local folder is `earth_sim`.
