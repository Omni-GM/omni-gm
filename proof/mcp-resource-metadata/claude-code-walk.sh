#!/usr/bin/env bash
set -u
export CLAUDE_CONFIG_DIR="$HOME/.cache/omnigm-claude-57/home"
cd "$HOME/.cache/omnigm-claude-57/proj"
site="$1"
for url in "$site/mcp" "$site/mcp/"; do
  echo "\$ claude mcp add --transport http omni-gm $url"
  claude mcp add --transport http omni-gm "$url" 2>&1 | grep -v "^File modified"
  echo "\$ claude mcp list"
  timeout 120 claude mcp list 2>&1
  echo "\$ claude mcp remove omni-gm"
  claude mcp remove omni-gm 2>&1 | grep -v "^File modified"
  echo
done
