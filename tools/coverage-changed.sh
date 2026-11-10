#!/usr/bin/env bash
# Report which lines changed on this branch no test runs, for review.
# Runs the Vitest suite under coverage, then diff-cover compares the lcov
# report with the diff against the base branch (first argument, default main;
# origin/<base> is used when that ref exists).
# Exit codes: 0 report printed (uncovered lines are reported, not enforced),
# 1 the test run failed, 2 the tooling or the base branch is missing, or
# diff-cover failed.
# Lives on the planner branch: run it with the worktree as the current
# directory, after setup-worktree.sh. Reports go under the worktree's git dir,
# so nothing shows up in git status.
set -euo pipefail

base="${1:-main}"
root="$(git rev-parse --show-toplevel)"
out="$(git rev-parse --path-format=absolute --git-dir)/planner-coverage"
diff_cover="$(git rev-parse --path-format=absolute --git-common-dir)/planner-venv/bin/diff-cover"
cd "$root"

missing=()
[[ -x node_modules/.bin/vitest ]] || missing+=("vitest")
[[ -f node_modules/@vitest/coverage-v8/package.json ]] || missing+=("@vitest/coverage-v8")
[[ -x $diff_cover ]] || missing+=("diff-cover")
if ((${#missing[@]})); then
	echo "Coverage tooling missing (${missing[*]}): run setup-worktree.sh in $root first" >&2
	exit 2
fi

if git rev-parse --verify --quiet "refs/remotes/origin/$base" >/dev/null; then
	compare="origin/$base"
elif git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
	compare="$base"
else
	echo "Base branch not found: neither origin/$base nor $base exists" >&2
	exit 2
fi

rm -rf "$out"
mkdir -p "$out"

# Coverage options are given here so vite.config.ts stays as it is. The
# include makes source files no test imports count as uncovered. Vitest empties
# its reports directory, so the log sits beside it, not in it.
echo "Vitest under coverage..."
npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.reporter=lcovonly \
	--coverage.reportsDirectory="$out/report" \
	--coverage.include='src/**/*.{ts,tsx}' \
	--coverage.exclude='**/*.test.{ts,tsx}' --coverage.exclude='**/*.d.ts' >"$out/vitest.log" 2>&1 \
	|| { cat "$out/vitest.log"; echo "Test run failed: no coverage report" >&2; exit 1; }
grep -E '^ *(Test Files|Tests) ' "$out/vitest.log" || true

lcov="$out/report/lcov.info"
if [[ ! -f $lcov ]]; then
	echo "Vitest passed but wrote no $lcov" >&2
	exit 2
fi

echo
echo "Changed lines against $compare:"
"$diff_cover" "$lcov" --compare-branch="$compare" \
	|| { echo "diff-cover failed" >&2; exit 2; }
