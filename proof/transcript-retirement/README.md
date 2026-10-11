# Transcript upload retirement proof

Ticket [#37](https://github.com/Omni-GM/omni-gm/issues/37), against spec [#35](https://github.com/Omni-GM/omni-gm/issues/35). All campaign data is invented.

- [Red](red-tool.log) and [green](green-tool.log) run the same MCP endpoint test. The server no longer lists or accepts `transcript_append`.
- [Full gate](check.log) runs `pnpm check`, including the existing signed URL and upload page byte-exact tests.
- [Baseline deployment](baseline-deploy.log), [seed](migration-seed.log), [migration deployment](migration-deploy.log) and [readback](migration-verify.log) prove deployment over existing chunk staging. Both deployment stages target `modest-hawk-89`. Cleanup deletes 106 chunk rows in two batches and two tickets. Completed and interrupted uploads retain their published Unicode/CRLF bytes, and an existing unused signed URL remains usable. The final schema omits `transcriptChunks` and `uploads.appendState`.
- [Long signed upload](signed-url-e2e.log) uploads and reads back every byte and all 4,801 utterances over 25 pages, then checks the scene lock.
- [No-shell run](no-shell.jsonl) and [independent verification](no-shell-verify.log) show the agent giving `pageUrl` and waiting, despite holding the fixture text in context. No transcript or scenes exist at this point.
- [Upload page ready](upload-page-ready.png) and [stored](upload-page-stored.png) show the actual preview page and actual `fixtures/session.txt` file upload. The browser used the already authenticated staging M2M token for the same owner as the agent. This checks file selection, upload, and confirmation; the unchanged AuthKit sign-in flow was not repeated.
- [Resumed no-shell run](resume.jsonl) and [verification](resume-verify.log) show the agent reading the stored transcript before saving scenes. Independent authenticated MCP readback compares the file bytes and stored scenes.
- [Shell run](shell.jsonl) and [verification](shell-verify.log) show `curl -T` from disk and the same readback. No transcript text appears in agent tool arguments or chat.

The agent runs use `claude -p --model claude-sonnet-5-5`, strict HTTP MCP configuration for the preview, and only MCP tools for no-shell/resume, or Bash plus MCP for the shell. Published JSONL excludes thinking, provider usage, and signed upload capabilities. Tokens and raw logs stay outside the repo.

To reproduce the migration, deploy commit `d44d4d3` to a new branch preview, then run `pnpm exec tsx scripts/transcript-retirement-e2e.ts seed <private-state-file>` with that preview URL and staging M2M token. On this branch, run `pnpm build:ledger` and `bash scripts/deploy.sh <same-preview-name>`, then run the e2e script with `verify <same-private-state-file>`. Use `--preview-name` for upgrades; `--preview-create` recreates the deployment and loses the seed. Parse local secrets with `load_env` in `~/.config/omni-gm/lib.sh`; never source the secrets file. The state file contains a short-lived signed upload capability and must stay private.
