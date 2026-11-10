#!/usr/bin/env bash
# Set up a git worktree of this repo so its checks and coverage can run: the
# npm packages, the Vitest coverage plugin, and diff-cover.
# Lives on the planner branch, not in the code: run it with the worktree as the
# current directory. Safe to run again: each step is skipped when it's already
# up to date. PYTHON overrides the interpreter used to create the venv.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
common="$(git rev-parse --path-format=absolute --git-common-dir)"
cd "$root"

if [[ ! -f package.json ]]; then
	echo "No package.json in $root: nothing to set up"
	exit 0
fi

# npm rewrites node_modules/.package-lock.json on every install, so its age
# against the lock file (or package.json when there is no lock file) says
# whether node_modules is current.
marker=node_modules/.package-lock.json
if [[ -f package-lock.json ]]; then
	if [[ ! -f $marker || package-lock.json -nt $marker ]]; then
		echo "Installing npm packages (npm ci)..."
		npm ci --no-audit --no-fund --loglevel=error
	fi
elif [[ ! -f $marker || package.json -nt $marker ]]; then
	# --no-package-lock: a new lock file would show up in git status.
	echo "Installing npm packages (npm install, no lock file)..."
	npm install --no-package-lock --no-audit --no-fund --loglevel=error
fi

# The coverage plugin must be the same version as Vitest. --no-save keeps
# package.json and the lock file untouched; npm ci removes the plugin again,
# so this runs after it and checks the installed version each time.
version_of() {
	node -p "try{JSON.parse(require('fs').readFileSync('node_modules/$1/package.json','utf8')).version}catch{''}"
}
vitest="$(version_of vitest)"
if [[ -z $vitest ]]; then
	echo "Vitest is not installed in $root: skipping the coverage plugin"
elif [[ "$(version_of @vitest/coverage-v8)" != "$vitest" ]]; then
	echo "Installing @vitest/coverage-v8@$vitest..."
	npm install --no-save --no-audit --no-fund --loglevel=error "@vitest/coverage-v8@$vitest"
fi

# diff-cover lives in one venv under the shared git dir, used by every worktree.
venv="$common/planner-venv"
if [[ ! -x $venv/bin/python ]]; then
	echo "Creating $venv..."
	"${PYTHON:-python3}" -m venv "$venv"
fi
if ! "$venv/bin/python" -c 'import diff_cover' 2>/dev/null || [[ ! -x $venv/bin/diff-cover ]]; then
	echo "Installing diff-cover..."
	"$venv/bin/python" -m pip install --quiet --disable-pip-version-check "diff-cover>=11.0"
fi

echo "Worktree ready: $root"
