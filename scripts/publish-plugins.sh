#!/bin/bash
set -euo pipefail

remote=${1:-origin}
current=$(git rev-parse --abbrev-ref HEAD)
version=$(node -e "console.log(require('./package.json').version);")
dist="plugins/v$version"
repo_root=$(git rev-parse --show-toplevel)

if [ "$current" != "main" ]; then
  echo "Skipping plugin publish: current branch is '$current', not 'main'."
  exit 0
fi

if git ls-remote --exit-code --heads "$remote" "$dist" >/dev/null 2>&1; then
  echo "Skipping plugin publish: $remote/$dist already exists."
  exit 0
fi

remote_url=$(git remote get-url "$remote")
repo_path=$(node -e 'const url = process.argv[1]; const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/); if (!match) process.exit(1); console.log(match[1].replace(/^\/+|\/+$/g, ""));' "$remote_url")
raw_base="https://raw.githubusercontent.com/$repo_path/$dist"
worktree="$repo_root/.tmp/publish-$remote-v$version"
index_file="$repo_root/.tmp/publish-$remote-v$version.index"

echo "Publishing plugins to $remote/$dist"
echo "Using USER_CONTENT_BASE=$raw_base"

mkdir -p "$repo_root/.tmp"
rm -rf "$worktree" "$index_file"
git worktree prune
git worktree add --detach "$worktree" HEAD >/dev/null

cleanup() {
  git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -f "$index_file"
}
trap cleanup EXIT

if [ -d "$repo_root/node_modules" ] && [ ! -e "$worktree/node_modules" ]; then
  ln -s "$repo_root/node_modules" "$worktree/node_modules"
fi

(
  cd "$worktree"
  rm -rf .dist .js total.svg
  node scripts/generate-plugin-index.js
  npx tsc --project tsconfig.production.json
  USER_CONTENT_BASE="$raw_base" BRANCH="$dist" npm run build:manifest
  npm run verify:plugins
)

if [ ! -s "$worktree/.dist/plugins.min.json" ]; then
  echo "ERROR: Manifest generation failed."
  exit 1
fi

(
  cd "$worktree"
  GIT_INDEX_FILE="$index_file" git read-tree --empty
  GIT_INDEX_FILE="$index_file" git add -f public/static .dist .js total.svg
  tree=$(GIT_INDEX_FILE="$index_file" git write-tree)
  commit=$(git commit-tree "$tree" -m "chore(plugins): publish plugin manifest")
  git push "$remote" "$commit:refs/heads/$dist"
)

echo "Published $remote/$dist"
