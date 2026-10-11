#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
preview="${1:-}"
run_args=()
args=(--yes --typecheck disable --codegen disable)
if [[ -n "$preview" ]]; then
  args+=(--preview-name "$preview")
  run_args+=(--preview-name "$preview")
fi
probe=$(pnpm exec convex run --inline-query 'const chunk = await ctx.db.query("transcriptChunks").first(); const ticket = await ctx.db.query("uploads").filter(q => q.neq(q.field("appendState"), undefined)).first(); return {needsMigration: !!chunk || !!ticket};' "${run_args[@]}")
if [[ "$(jq -r .needsMigration <<<"$probe")" == false ]]; then
  echo "Legacy chunk staging is empty; deploying the final schema directly."
  pnpm exec convex deploy "${args[@]}"
  exit 0
fi
tmp=$(mktemp -d "$root/.retirement-XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp package.json "$tmp/"
ln -s "$root/node_modules" "$tmp/node_modules"
cp -R convex "$tmp/convex"
mv "$tmp/convex/schema.ts" "$tmp/convex/currentSchema.ts"
sed 's|../../convex/schema|./currentSchema|' scripts/transcript-retirement/schema.ts > "$tmp/convex/schema.ts"
cp scripts/transcript-retirement/clear.ts "$tmp/convex/retireTranscriptAppend.ts"
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
