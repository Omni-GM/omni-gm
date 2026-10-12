#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
proof="$root/proof/session-note"
: "${OMNI_GM_MCP_URL:?Set OMNI_GM_MCP_URL}"
: "${OMNI_GM_ACCESS_TOKEN:?Set OMNI_GM_ACCESS_TOKEN}"
private=$(mktemp -d /tmp/headless42.XXXXXX)
trap 'rm -rf "$private"' EXIT
export NOTE42_PRIVATE="$private"
python3 - <<'PY'
import json,os
p=os.environ['NOTE42_PRIVATE']+'/mcp.json'
with open(p,'w') as f:json.dump({'mcpServers':{'omni':{'type':'http','url':os.environ['OMNI_GM_MCP_URL'],'headers':{'Authorization':'Bearer '+os.environ['OMNI_GM_ACCESS_TOKEN']}}}},f)
os.chmod(p,0o600)
PY
mkdir "$private/empty"
cd "$private/empty"
: > "$proof/claude.jsonl"
resume=()
inputs=(note-start note-first-pick note-stop note-resume note-finish)
for (( turn=1; turn<=5; turn++ )); do
  if [[ "$turn" == 4 ]]; then resume=(); fi
  claude -p --model claude-opus-5-5 --setting-sources user --settings '{"disableAllHooks":true}' --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." --strict-mcp-config --mcp-config "$private/mcp.json" --tools '' --permission-mode bypassPermissions --disable-slash-commands --verbose --output-format stream-json "${resume[@]}" < "$root/fixtures/${inputs[turn-1]}.md" > "$private/turn-$turn.jsonl" 2> "$private/turn-$turn.err"
  python3 - "$private/turn-$turn.jsonl" "$proof/claude.jsonl" "$turn" "$root/fixtures/${inputs[turn-1]}.md" <<'PY'
import sys,json
raw,dest,turn,prompt=sys.argv[1:];turn=int(turn)
with open(dest,'a') as out:
 out.write(json.dumps({'type':'input','turn':turn,'text':open(prompt).read()},ensure_ascii=False)+'\n')
 for line in open(raw):
  e=json.loads(line);item={'type':e['type'],'turn':turn}
  if e['type'] in ('assistant','user'):
   content=[b for b in e.get('message',{}).get('content',[]) if b.get('type') in ('text','tool_use','tool_result')]
   item['message']={'content':content}
   if e['type']=='assistant':item['message']['model']=e['message'].get('model')
  elif e['type']=='result':item.update({k:e[k] for k in ('subtype','result','is_error') if k in e})
  else:continue
  out.write(json.dumps(item,ensure_ascii=False)+'\n')
PY
  sid=$(jq -r 'select(.type == "result") | .session_id' "$private/turn-$turn.jsonl")
  [[ -n "$sid" && "$sid" != null ]]
  if [[ "$turn" == 3 ]]; then
    first_session="$sid"
    (cd "$root" && pnpm exec tsx scripts/session-note-e2e.ts --stopped > "$proof/stopped-readback.log" 2>&1)
  elif [[ "$turn" == 4 ]]; then
    [[ "$sid" != "$first_session" ]]
    echo 'PASS resume is a fresh conversation, with a different provider session and MCP connection' > "$proof/fresh-conversation.log"
  fi
  resume=(--resume "$sid")
  echo "Completed headless turn $turn"
done
(cd "$root" && pnpm exec tsx scripts/session-note-e2e.ts > "$proof/headless-readback.log" 2>&1)
