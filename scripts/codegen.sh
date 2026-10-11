#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .codegen
if [[ -f .codegen/.env.local ]] && ! rg -q '^CONVEX_DEPLOYMENT=anonymous:' .codegen/.env.local; then
  echo 'Codegen only uses an anonymous local deployment.' >&2
  exit 1
fi
rm -rf .codegen/convex
cp -R convex .codegen/convex
cp package.json .codegen/package.json
ln -sfn ../node_modules .codegen/node_modules
printf 'export default { providers: [] };\n' > .codegen/convex/auth.config.ts
(
  cd .codegen
  unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
  CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once --typecheck disable
  pnpm exec convex codegen --typecheck disable
)
cp -R .codegen/convex/_generated/. convex/_generated/
