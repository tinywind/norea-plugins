#!/bin/bash
set -euo pipefail

remote=${1:-origin}
base_branch=${2:-}
current=$(git rev-parse --abbrev-ref HEAD)
if [ -z "$base_branch" ]; then
  base_branch=$current
fi
dist="dist/$base_branch"
repo_root=$(git rev-parse --show-toplevel)

case "$base_branch" in
  dist/*|plugins/*|*/plugins/*)
  echo "Skipping plugin publish: base branch is '$base_branch'."
  exit 0
  ;;
esac

remote_url=$(git remote get-url "$remote")
repo_path=$(printf '%s\n' "$remote_url" | sed -nE 's#^.*github\.com[:/]([^[:space:]]+)$#\1#p' | sed -E 's#/+$##; s#\.git$##; s#^/+##; s#/+$##')
if [ -z "$repo_path" ]; then
  echo "ERROR: Could not parse GitHub repository path from remote URL." >&2
  exit 1
fi
raw_base="https://raw.githubusercontent.com/$repo_path/$dist"
display_raw_base="$raw_base"

release_ref="refs/remotes/$remote/$dist"
branch_exists=false
safe_dist=$(printf '%s' "$dist" | sed -E 's/[^a-zA-Z0-9_.-]+/-/g')
worktree="$repo_root/.tmp/publish-$remote-$safe_dist"
index_file="$repo_root/.tmp/publish-$remote-$safe_dist.index"
container_home="$repo_root/.tmp/publish-home-$remote-$safe_dist"

echo "Publishing plugins to $remote/$dist"
echo "Using USER_CONTENT_BASE=$display_raw_base"

if git ls-remote --exit-code --heads "$remote" "$dist" >/dev/null 2>&1; then
  branch_exists=true
  git fetch "$remote" "+refs/heads/$dist:$release_ref" >/dev/null
else
  echo "Creating plugin publish branch: $remote/$dist"
fi

mkdir -p "$repo_root/.tmp"
rm -rf "$worktree" "$index_file" "$container_home"
git worktree prune
git worktree add --detach "$worktree" HEAD >/dev/null

cleanup() {
  git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$index_file" "$container_home"
}
trap cleanup EXIT

if [ -d "$repo_root/node_modules" ] && [ ! -e "$worktree/node_modules" ]; then
  ln -s "$repo_root/node_modules" "$worktree/node_modules"
fi

node_image="${NODE_IMAGE:-node:24-bookworm}"
use_docker="${NOREA_PUBLISH_IN_DOCKER:-1}"

if [ "$use_docker" = "1" ]; then
  mkdir -p "$container_home"
  docker_args=(
    --rm
    --user "$(id -u):$(id -g)"
    -v "$repo_root:$repo_root"
    -v "$container_home:/tmp/home"
    -w "$worktree"
    -e HOME=/tmp/home
    -e "CI=${CI:-}"
    -e "BRANCH=$dist"
    -e USER_CONTENT_BASE
    -e GIT_CONFIG_COUNT=1
    -e GIT_CONFIG_KEY_0=safe.directory
    -e "GIT_CONFIG_VALUE_0=*"
  )
  if [ -n "${NPM_CACHE_DIR:-}" ]; then
    mkdir -p "$NPM_CACHE_DIR"
    docker_args+=(-v "$NPM_CACHE_DIR:/npm-cache" -e npm_config_cache=/npm-cache)
  fi
  USER_CONTENT_BASE="$raw_base" docker run "${docker_args[@]}" "$node_image" \
    bash -euo pipefail -c '
      rm -rf .dist .js total.svg
      node scripts/generate-plugin-index.js
      npm run build:compile
      npm run build:manifest
      npm run verify:plugins
    '
else
  (
    cd "$worktree"
    rm -rf .dist .js total.svg
    node scripts/generate-plugin-index.js
    npm run build:compile
    USER_CONTENT_BASE="$raw_base" BRANCH="$dist" npm run build:manifest
    BRANCH="$dist" npm run verify:plugins
  )
fi

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
