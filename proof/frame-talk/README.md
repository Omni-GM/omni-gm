# Frame talk proof

Invented data only. The fixture answers are in `fixtures/frame-talk-answers.md`; the existing session fixture is `fixtures/session.txt`.

- `01-red-update.log`: the acceptance test fails because frame_update is missing.
- `02-red-isolation.log`: an empty field set was wrongly accepted.
- `03-red-skill.log`: the client cannot load frame-talk.
- `04-red-last-time.log`: 201 frame commits wrongly hide the latest debrief's lastTime.
- `green-endpoint.log`: the same endpoint assertions pass in the full suite, with no skipped tests.
- `check.log`: Biome, isolated anonymous-local Convex codegen, both TypeScript projects and all endpoint tests pass. One existing Biome info is not an error.
- `sdk-preview-deploy.log`, `sdk-seed.log`, `sdk-e2e.log`: the official MCP SDK signs in with staging M2M on the branch preview, writes all eight fields, patches only timeframe, reads before/after history with reasons and compares the complete fixture story state.
- `claude-preview-deploy.log`, `claude-seed.log`, `claude-before.log`, `claude-story-before.json`, `claude.jsonl`, `claude-readback.log`: a fresh preview is seeded; the story snapshot precedes the headless Claude Sonnet 5.5 frame talk; independent SDK readback checks exact goal, stakes, timeframe and reason, one frame commit and unchanged story state. The transcript proves the skill was loaded before writing and no outcome questions were asked. All answers and satisfaction were given up front, so it does not prove a multi-turn interview.
- `opus-native-review.md`, `opus-cli-review.md`, `opus-final-review.md`, `review-dispositions.md`: both read-only other-family reviews and every finding's disposition. Reviewers inspected intermediate proof files; the final readback and SDK logs supersede those observations.

The deployed proof uses per-branch staging previews as authorized by #12. The scripts print each public preview origin; deploy logs identify the same target and the source commit deployed. The final source combines main through #23 and passes 38 endpoint tests. Tokens, MCP capability metadata, provider usage, session identifiers belonging to the provider and thinking blocks are omitted from the public Claude transcript. MCP tool calls/results and assistant text remain intact.

The headless client exposes only the explicit Omni-GM MCP configuration, disables hooks and replaces the operator's system prompt with a neutral client role. The prompt contains no procedure text; it asks the client to load the procedure from the server. User settings are retained for provider authentication. These options produced the final run:

```sh
claude -p --model claude-sonnet-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/frame-talk-answers.md
```

The private MCP config contains only the branch preview URL and its staging M2M bearer token and is removed after the run. Load credentials with `~/.config/omni-gm/lib.sh` `load_env`, never by sourcing secrets.env. Reproduce the SDK checks with `pnpm e2e`, `pnpm exec tsx scripts/frame-e2e.ts`, and `pnpm exec tsx scripts/verify-frame-talk.ts --before` before the headless run followed by `pnpm exec tsx scripts/verify-frame-talk.ts` afterward.

Owner isolation, new-adventure isolation and strict unknown-field rejection are endpoint coverage. Empty-string clearing is green-only coverage because the initial implementation already did it correctly. The final full suite covers every assertion without skips.

Trailing terminal whitespace and redundant final blank lines are removed from the text logs. No assertion or test result is removed.
