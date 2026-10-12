#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
proof="$root/proof/session-note"
: "${OMNI_GM_MCP_URL:?Set OMNI_GM_MCP_URL}"
: "${OMNI_GM_ACCESS_TOKEN:?Set OMNI_GM_ACCESS_TOKEN}"
private=$(mktemp -d /tmp/vault42.XXXXXX)
trap 'rm -rf "$private"' EXIT
export NOTE42_PRIVATE="$private"
python3 - <<'PY'
import json,os
p=os.environ['NOTE42_PRIVATE']+'/mcp.json'
with open(p,'w') as f:json.dump({'mcpServers':{'omni':{'type':'http','url':os.environ['OMNI_GM_MCP_URL'],'headers':{'Authorization':'Bearer '+os.environ['OMNI_GM_ACCESS_TOKEN']}}}},f)
os.chmod(p,0o600)
PY
mkdir "$private/empty" "$private/vault"
printf 'Ich nutze Claude Code. Bitte hole meine fertige Sitzungsnotiz aus dem Store und lege sie unverändert als %s/vault/next-session.md in meinem Vault ab. Keine Änderungen an der Vorbereitung.\n' "$private" > "$private/input.md"
cd "$private/empty"
claude -p --model claude-opus-5-5 --setting-sources user --settings '{"disableAllHooks":true}' --system-prompt "You are Claude Code connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language." --strict-mcp-config --mcp-config "$private/mcp.json" --tools Write --allowedTools Write --permission-mode bypassPermissions --disable-slash-commands --verbose --output-format stream-json < "$private/input.md" > "$private/raw.jsonl" 2> "$private/raw.err"
python3 - "$private" "$proof" <<'PY'
import sys,json,pathlib
private,proof=map(pathlib.Path,sys.argv[1:]); events=[];calls=[]
for line in open(private/'raw.jsonl'):
 e=json.loads(line); item={'type':e['type']}
 if e['type'] in ('assistant','user'):
  content=[b for b in e.get('message',{}).get('content',[]) if b.get('type') in ('text','tool_use','tool_result')]
  item['message']={'content':content}
  if e['type']=='assistant':
   assert e['message']['model']=='claude-opus-5-5'
   item['message']['model']=e['message']['model']
   calls += [b for b in content if b['type']=='tool_use']
 elif e['type']=='result':
  assert e['subtype']=='success'
  item.update({k:e[k] for k in ('subtype','result','is_error') if k in e})
 else:continue
 events.append(item)
assert all(c['name'].split('__')[-1] in ['skill','get','find','Write'] for c in calls)
assert len([c for c in calls if c['name']=='Write'])==1
stored=json.load(open(proof/'finished-note.json'))
text=(private/'vault/next-session.md').read_text()
for entry in stored['entries']:
 if entry['status']=='done':assert entry['entry'] in text
at=-1
for h in ['# Nächste Sitzung: Die Talgmühle','## Auftakt','## Spuren','## Requisiten','## Belohnungen']:
 pos=text.find(h);assert pos>at;at=pos
(proof/'vault-note.md').write_text(text)
(proof/'vault-claude.jsonl').write_text('\n'.join(json.dumps(e,ensure_ascii=False).replace(str(private),'<invented-vault>') for e in events)+'\n')
print('PASS fresh Claude Code client reads the finished note; one Write copies its saved template and GM wording into the invented vault, with no store writes')
PY
