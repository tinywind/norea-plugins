$current = git rev-parse --abbrev-ref HEAD
$version = node -e "console.log(require('./package.json').version);"
$dist = "plugins/v$version"

Write-Output "Publishing plugins: $current -> $dist (v$version)"

$exists = git show-ref refs/heads/$dist
if ($exists) {
  git branch -D $dist
}

Remove-Item -Recurse -Force .dist, .js, total.svg -ErrorAction SilentlyContinue
node scripts/generate-plugin-index.js
npx tsc --project tsconfig.production.json
npm run build:manifest

if (-not (Test-Path .dist/plugins.min.json)) {
  Write-Error "Manifest generation failed."
  exit 1
}

git checkout --orphan $dist
git reset
New-Item -ItemType Directory -Force -Path .js/src | Out-Null
Copy-Item -Path .js/plugins -Destination .js/src/plugins -Recurse -Force
git add -f public/static .dist .js/src/plugins total.svg
git commit -m "chore(plugins): publish plugin manifest"
git push -f origin $dist
git checkout -f $current

Write-Output "Published to $dist"
