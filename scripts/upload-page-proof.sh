#!/usr/bin/env bash
# Signs in to the upload page as a real AuthKit user in a fresh browser,
# drops a fixture and checks the stored bytes. Values are read from the
# environment and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${OMNI_GM_SITE:?Set OMNI_GM_SITE to https://<preview>.convex.site}"
: "${OMNI_GM_TEST_USER_EMAIL:?}" "${OMNI_GM_TEST_USER_PASSWORD:?}"
: "${OMNI_GM_OTHER_ACCESS_TOKEN:?Set a token of a second owner}"
fixture=${FIXTURE:-fixtures/session.txt}
out=${PROOF_DIR:-proof/upload-page}
shots="$out/screenshots"
mkdir -p "$shots"
export OMNI_GM_MCP_URL="$OMNI_GM_SITE/mcp"
export AGENT_BROWSER_SESSION="upload-page-proof-$$"

ab() {
  local output
  [[ "$1" == wait ]] && echo "waiting for ${*:2}" >&2
  output=$(agent-browser --args "--no-sandbox" "$@" 2>&1) || {
    grep -v crashpad <<<"$output" >&2
    return 1
  }
  grep -v crashpad <<<"$output" || true
}
step() { printf '\n== %s\n' "$*"; }
shot() { ab screenshot "$shots/$1.png" >/dev/null; echo "screenshot $shots/$1.png"; }
view() {
  ab eval '[...document.querySelectorAll("[data-view]")].find((el) => !el.hidden)?.innerText'
}
widths() {
  for size in "1280 800" "768 900" "390 844"; do
    read -r w h <<<"$size"
    ab set viewport "$w" "$h" >/dev/null
    shot "$1-${w}"
  done
  ab set viewport 1280 800 >/dev/null
}

trap 'agent-browser close >/dev/null 2>&1 || true' EXIT

step "Second owner creates a session through MCP"
other=$(OMNI_GM_ACCESS_TOKEN="$OMNI_GM_OTHER_ACCESS_TOKEN" pnpm exec tsx scripts/upload-page-e2e.ts session)
other_page=$(jq -r .pageUrl <<<"$other")
echo "other owner's page: $other_page"

step "Anonymous visitor, fresh browser"
ab open "$other_page" >/dev/null
ab wait --text "Sign in to upload" >/dev/null
view
shot 01-anonymous
echo "API without sign-in: $(curl -s -o /dev/null -w '%{http_code}' "$OMNI_GM_SITE/upload-page/session?session=$(jq -r .session <<<"$other")")"

step "Real AuthKit sign-in as the test user"
ab find role button click --name "Sign in" >/dev/null
ab wait --url "**authkit.app/**" >/dev/null
ab wait 'input[type="email"]' >/dev/null
shot 02-authkit-email
ab fill 'input[type="email"]' "$OMNI_GM_TEST_USER_EMAIL" >/dev/null
ab press Enter >/dev/null
ab wait 'input[type="password"]' >/dev/null
ab fill 'input[type="password"]' "$OMNI_GM_TEST_USER_PASSWORD" >/dev/null
ab press Enter >/dev/null
ab wait --fn "location.origin === '$OMNI_GM_SITE' || document.body.innerText.includes('Allow access')" >/dev/null
if [[ "$(ab get url)" != "$OMNI_GM_SITE"* ]]; then
  shot 03-authkit-consent
  for _ in 1 2 3 4 5; do
    allow=$(ab snapshot -i | grep -o '"Allow access" \[ref=e[0-9]*' | grep -o 'e[0-9]*$' || true)
    [[ -n "$allow" ]] && break
    sleep 1
  done
  ab click "@$allow" >/dev/null
else
  echo "consent was already granted to this client"
fi
ab wait --url "$OMNI_GM_SITE/upload-page?session=*" >/dev/null
ab wait --text "not in your campaign" >/dev/null
echo "URL after sign-in: $(ab get url)"

step "Signed in, another owner's session is refused"
view
shot 04-other-owner-refused

step "The test user creates their own session through MCP"
user_token=$(ab eval 'sessionStorage.getItem("omni-gm-upload-token")' | jq -r .)
[[ "$user_token" == ey* ]] || { echo "no access token in the page"; exit 1; }
mine=$(OMNI_GM_ACCESS_TOKEN="$user_token" pnpm exec tsx scripts/upload-page-e2e.ts session)
session=$(jq -r .session <<<"$mine")
page=$(jq -r .pageUrl <<<"$mine")
echo "own page: $page"

step "Own session is ready for a file"
ab open "$page" >/dev/null
ab wait --text "Drop the transcript file here" >/dev/null
view
widths 05-ready

step "Drop the fixture onto the drop zone"
fixture_b64=$(base64 -w0 "$fixture")
cat <<JS | ab eval --stdin >/dev/null
(() => {
  const bytes = Uint8Array.from(atob("$fixture_b64"), (c) => c.charCodeAt(0));
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], "$(basename "$fixture")", { type: "text/plain" }));
  const zone = document.getElementById("drop");
  zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
})()
JS
ab wait --text "is stored" >/dev/null
view
widths 06-stored

step "Stored file is byte-exact (read back through MCP as the same user)"
OMNI_GM_ACCESS_TOKEN="$user_token" pnpm exec tsx scripts/upload-page-e2e.ts verify "$session" "$fixture"
