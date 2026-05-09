#!/bin/bash
set -euo pipefail

remote=${1:-origin}
base_branch=${2:-}
current=$(git rev-parse --abbrev-ref HEAD)
version=$(node -e "console.log(require('./package.json').version);")
if [ -z "$base_branch" ]; then
  base_branch=$current
fi
dist="$base_branch-dist/plugins/v$version"
repo_root=$(git rev-parse --show-toplevel)

case "$base_branch" in
  plugins/*|*/plugins/*)
  echo "Skipping plugin publish: base branch is '$base_branch'."
  exit 0
  ;;
esac

remote_url=$(git remote get-url "$remote")
repo_path=$(node -e 'const url = process.argv[1]; const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/); if (!match) process.exit(1); console.log(match[1].replace(/^\/+|\/+$/g, ""));' "$remote_url")
raw_base="https://raw.githubusercontent.com/$repo_path/$dist"
display_raw_base="$raw_base"

if [ "$base_branch" = "private" ] && [ -n "${NOREA_RAW_GITHUB_TOKEN:-}" ]; then
  raw_base="https://x-access-token:${NOREA_RAW_GITHUB_TOKEN}@raw.githubusercontent.com/$repo_path/$dist"
  display_raw_base="https://x-access-token:***@raw.githubusercontent.com/$repo_path/$dist"
fi

release_ref="refs/remotes/$remote/$dist"
branch_exists=false
safe_dist=$(printf '%s' "$dist" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => console.log(data.replace(/[^a-zA-Z0-9_.-]+/g, "-")));')
worktree="$repo_root/.tmp/publish-$remote-$safe_dist"
index_file="$repo_root/.tmp/publish-$remote-$safe_dist.index"

echo "Publishing plugins to $remote/$dist"
echo "Using USER_CONTENT_BASE=$display_raw_base"

if git ls-remote --exit-code --heads "$remote" "$dist" >/dev/null 2>&1; then
  branch_exists=true
  git fetch "$remote" "+refs/heads/$dist:$release_ref" >/dev/null
else
  echo "Creating plugin publish branch: $remote/$dist"
fi

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

  parent_args=()
  if [ "$branch_exists" = true ]; then
    parent=$(git rev-parse "$release_ref")
    parent_args=(-p "$parent")
  fi

  commit=$(git commit-tree "$tree" "${parent_args[@]}" -m "chore(plugins): publish plugin manifest")
  git push "$remote" "$commit:refs/heads/$dist"
)

echo "Published $remote/$dist"
