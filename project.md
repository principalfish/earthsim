# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

**Languages:** TypeScript, HTML, CSS · **Base branch:** main

**Components:** none yet (the repo has no source files).

**Checks:** not scaffolded yet. Chosen tooling: npm, Vite, Vitest, Biome, `tsc`. Intended commands once the first build piece adds `package.json`: `npx vitest run` (tests), `npx biome check .` (lint and format), `npx tsc --noEmit` (types). Replace this line with the real commands when they exist.

**Worktree setup:** none yet. Once `package.json` exists: a `setup-worktree.sh` in the planner branch's `tools/` that runs `npm install` when `node_modules` is missing.

**Coverage:** none yet. Once tests exist: a script in the planner branch's `tools/` that runs Vitest with v8 coverage and feeds the report to `diff-cover` against the base branch. `diff-cover` is not installed on this machine.

**Commit style:** default (see git.md).

## Instructions

- Purpose is worldbuilding: believable results and a fast-running simulation matter more than physical fidelity.
- The app runs entirely in the browser as static files, with no server.
- Formatting and linting belong to Biome; do not add ESLint or Prettier.
- GitHub remote: `principalfish/earthsim` (private). The local folder is `earth_sim`.
