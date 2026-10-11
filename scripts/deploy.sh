#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
preview="${1:-}"
tmp=$(mktemp -d "$root/.retirement-XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp package.json "$tmp/"
ln -s "$root/node_modules" "$tmp/node_modules"
cp -R convex "$tmp/convex"
mv "$tmp/convex/schema.ts" "$tmp/convex/currentSchema.ts"
sed 's|../../convex/schema|./currentSchema|' scripts/transcript-retirement/schema.ts > "$tmp/convex/schema.ts"
cp scripts/transcript-retirement/clear.ts "$tmp/convex/retireTranscriptAppend.ts"
args=(--yes --typecheck disable --codegen disable)
run_args=()
if [[ -n "$preview" ]]; then
  args+=(--preview-name "$preview")
  run_args+=(--preview-name "$preview")
fi
(
  cd "$tmp"
  pnpm exec convex deploy "${args[@]}"
  cursor=null
  for ((batch=0; batch<10000; batch++)); do
    reply=$(pnpm exec convex run retireTranscriptAppend:clear "{\"cursor\":$cursor}" "${run_args[@]}")
    printf '%s\n' "$reply"
    [[ "$(jq -r .done <<<"$reply")" == true ]] && break
    cursor=$(jq -c .cursor <<<"$reply")
  done
  [[ "$(jq -r .done <<<"$reply")" == true ]]
)
pnpm exec convex deploy "${args[@]}"
