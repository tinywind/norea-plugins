#!/bin/bash
set -euo pipefail

current=$(git rev-parse --abbrev-ref HEAD)
version=$(node -e "console.log(require('./package.json').version);")
dist="plugins/v$version"

echo "Publishing plugins: $current -> $dist (v$version)"

if git show-ref --verify --quiet "refs/heads/$dist"; then
  git branch -D "$dist"
fi

rm -rf .dist .js total.svg
node scripts/generate-plugin-index.js
npx tsc --project tsconfig.production.json
BRANCH="$dist" npm run build:manifest

if [ ! -s ".dist/plugins.min.json" ]; then
  echo "ERROR: Manifest generation failed."
  exit 1
fi

git checkout --orphan "$dist"
git reset
git add -f public/static .dist .js/plugins total.svg
git commit -m "chore(plugins): publish plugin manifest"
git push -f origin "$dist"
git checkout -f "$current"

echo "Published to $dist"
