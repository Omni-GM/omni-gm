# Transcribe procedure proof

Every recording, name and line here is invented. Each hosted run targets a
staging branch preview and signs in with the staging M2M identity.

## Endpoint proof

The test seam is the `skill` tool and `tools/list` over MCP JSON-RPC, in
`tests/transcribe.test.ts`.

| Acceptance | Red | Green |
| --- | --- | --- |
| The `skill` tool lists `transcribe` with its frontmatter description, and `skill name: "Transcribe"` returns the `SKILL.md` body word for word, then the standing rules | [01-red](01-red-served-procedure.log): the file does not exist | [01-green](01-green-served-procedure.log) |
| `debrief` and `map-speakers` send a recording to `transcribe` first | [01-red](01-red-served-procedure.log): no `load skill transcribe` | [01-green](01-green-served-procedure.log) |
| The `skill` tool description names every served procedure and says a recording starts with `transcribe` | [02-red](02-red-skill-tool-description.log): the hand-written list misses `transcribe` | [02-green](02-green-skill-tool-description.log) |
| `SKILL.md` frontmatter reads the same with CRLF line endings and quoted values, through the parser that the generator and the drift test share | [04-red](04-red-frontmatter.log): the old parsing rejects CRLF as missing frontmatter | [04-green](04-green-frontmatter.log) |
| A `SKILL.md` that reuses a written procedure's name stops the server instead of replacing the procedure | [05-red](05-red-collision.log): the server starts and the later definition wins | [05-green](05-green-collision.log) |

The third row comes from the first no-shell run below, which never loaded
`transcribe` because the description listed procedures by hand. Rows 4 and 5 come from the code review. Each red run restored the old
behavior in the working tree, and the fix went back before the green run.
`check.log` is the full gate (`pnpm check`) on the final tree.

## Hosted proof

`preview-deploy-1.log` names commit `912f1fb` and the preview
`cool-guanaco-43`. `served-readback.log` reads the procedures back over
MCP with curl. `transcribe` is listed, its served text starts with the
`SKILL.md` body, and the debrief carries the pointer.

`shell-run-v1.jsonl` is one two-turn Claude Opus 5.5 conversation with a
shell, started from `shell-turn-1.md` and continued with `shell-turn-2.md`.
The game master brings `session-3.vtt`, an invented call export with voice
tags. The agent loads `transcribe`, reads only the first lines, converts
the file with a local script into `session-3.omni-gm.txt`, checks its
format and shows the summary. It asks for an adventure name before it
creates a campaign. After the answer it starts the adventure, creates the
session, uploads with `curl -T` from disk and confirms the transcript with
`get transcript:<session>`. `shell-run-v1-readback.log` reads the transcript
back independently: 8 utterances from three speakers, and the stored bytes
equal the converted file.

`preview-deploy-2.log` names commit `131b501` and the preview
`effervescent-vulture-152`. `skill-tool-readback.log` shows the `skill`
tool description naming `transcribe`.

`no-shell-run-v1.jsonl` is a Claude Opus 5.5 run with only the MCP tools, as
in Claude Desktop, given `no-shell-turn.md`. It loads `transcribe`, says
this client cannot transcribe, and offers Claude Code or another
transcription tool. Then it shows the line format and the limits.
`no-shell-run-rejected.jsonl` is the same input against the first preview.
That run never called `skill`. It answered from general knowledge and
offered a disk upload it had no shell for. It led to the description fix
above.

`preview-deploy-3.log` names commit `d745c87`, which carries the procedure
review's fixes, and the preview `handsome-malamute-155`. `shell-run.jsonl`
and `no-shell-run.jsonl` are the same inputs run again against that text,
and `shell-run-readback.log` reads the stored bytes back and confirms the
served `transcribe` text starts with the `SKILL.md` body at `d745c87`. The
shell run offers to delete its work folder at the end, and the no-shell
answer names the exact export format and says that SRT and VTT need
converting.

The procedure's final reads changed the text after `d745c87` without a
hosted rerun. The changes cover step 1's questions (generic transcript
labels, who is on which channel), step 3's audio branches (parts joined
first, install sources, `whisperx` offered for speaker separation) and step
4's speaker and size rules (`GM` or the game master's name, under 32,000
bytes per utterance). The VTT run's output already meets the final step 4
rules: its speakers are the game master's and players' names and its
longest line is far below the limit. The audio branches stay unexercised,
as listed under Gaps. `tests/transcribe.test.ts` checks that the served text
equals the final `SKILL.md`.
The `-v1` files are the runs against the first text at `912f1fb` and
`131b501`.

Published runs keep the game-master input, assistant text, tool calls and
tool results, each result cut to its first 4,000 characters. The served
procedure text is therefore incomplete in the runs; the readback logs compare
it in full. Runs drop thinking, usage and session identifiers, and the
single-use upload token is replaced.

## Gaps

- Audio was not transcribed. The devbox has no `ffmpeg`, speech-to-text
  engine or text-to-speech tool to make invented audio, so step 3 of the
  procedure, engine choice and speaker separation, has no headless run.
  A phone recording on a Mac is the next check.
- The three preview deployments could not be deleted. The Convex team access token
  in the operator's local secrets returned 401. Staging previews expire on
  their own.
