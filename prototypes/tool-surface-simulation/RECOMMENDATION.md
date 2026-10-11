# Recommendation: surface E

Full numbers in [`results/scorecard.md`](results/scorecard.md); exact input schemas in [`results/surface-E-tools.json`](results/surface-E-tools.json).

## What the matrix showed

- **Every surface works.** 210 task runs (5 surfaces x 7 tasks x 3 runs x 2 models) all passed every critical gold check, with zero rule breaks. Sonnet 5.5 and GPT-6.1 Sol can do the v1 work on any of these shapes, so the choice rests on cost, wrong calls, and whether the procedures reach the model.
- **Procedures only reach the model through a tool.**
  - Codex never shows MCP server instructions to the model. Asked to quote them, GPT-6.1 Sol answered "NONE".
  - Claude Code shows them, but cuts them at 4,096 characters, which here was mid-procedure.
  - No client fetched an MCP prompt in any run.
  - So surface D (procedures in instructions) and A/B (procedures as prompts) leave Codex with no procedures at all. The `skill` tool (C, E) was the only channel both clients used. They loaded the right procedure unprompted before writing in 57 of 60 runs on C and E. All three misses are Sonnet on read-only prep questions, which it answered correctly without the procedure.
- **Narrow verbs cost the most.** B, with one change per call, needed 37-51 calls for a debrief, against 7-21 on A and E.
- **Generic `find`/`get` was expensive until the contract was fixed.** On C, Codex checked existing entities one by one (13 `find` + 26 `get` in one debrief). Twelve rejected calls were models trying to list with an empty `find`. Surface E fixed the contract. That cut calls per task by a third (Sonnet 9.3 to 6.0) to nearly half (Codex 15.2 to 8.7), and brought tokens close to A, the cheapest: Sonnet 105k vs 102k per task, Codex 241k vs 201k. E also had no contract rejections.
- **The server rules never had to fire on a guess.** In the guess trap (the GM asks to put a player's theory on an NPC), all 30 runs recorded it on a thread as `player_guess` and told the GM why. The rule is also stated in the `basis` field schema, which both clients read. Keep it server-enforced anyway.

## The surface (E)

Reads: `find`, `get`, `skill`. Writes: one tool per write, with batches where a write is naturally a list.

| Tool | Kind | Input |
| --- | --- | --- |
| `find` | read | `query?: string`, `types?: ("entity"\|"source"\|"scene"\|"transcript")[]`, `kinds?: string[]`, `limit?: int <= 200` |
| `get` | read | `ref?: string` or `refs?: string[] (<= 25)` |
| `skill` | read | `name?: string` (no name lists the procedures) |
| `session_create` | write | `playedOn: "YYYY-MM-DD"` (current adventure) |
| `transcript_upload_url` | write | `session` |
| `scenes_set` | write | `session`, `scenes: {title, start, end?, place, summary}[]` |
| `debrief_add` | write | `session`, `changes: {scene, change, basis[], sources[], why}[]` |
| `debrief_drop` | write | `session`, `changeIds: string[]` |
| `debrief_commit` | write | `session` |
| `story_commit` | write | `reason`, `changes: {change, basis[], sources[], why}[]` (all or nothing) |
| `frame_update` | write | `reason`, `fields: {goal?, stakes?, timeframe?, pressure?, finale?, moves_main_plot?, pulls_in?, next_session_starts?}` |
| `schema_change` | write | `reason`, `ops: (add_property \| retire_property \| add_relationship_type)[]` |

- `change` is `new {tempKey?, kind, name, aliases?, properties?}`, `update {entity, properties?, addAliases?}`, `relate {type, from, to}`, or `unrelate {type, from, to}`. `entity`, `from`, and `to` take an entity id, or `$tempKey` within one batch or draft.
- `basis` is one or more of `narrated`, `npc_said`, `rumor`, `player_guess`, `player_plan`, `game_master`. `sources` holds at least one `{quote, at?}`.
- The spec's `story_read`, `debrief`, `adventure`, and `story_correct` map to `find`/`get`, the `debrief_*` tools, `frame_update` (+ `get frame`), and `story_commit`.
- For the real build: `debrief_add` and `debrief_drop` should return the draft and carry the draft-debrief view (`_meta.ui`). In the simulation they returned only per-change results. Reads become queries and each write one mutation, as the spec says.

## Skills (procedures served by `skill`)

`map-speakers`, `split-scenes`, `debrief`, `frame-talk`, `prep-sparring`, `plank-questions`.

- Every loaded procedure ends with the standing rules, because Codex never sees the server instructions.
- `skill` accepts loose names ("frame talk"). The models used them.
- The write tools that carry a rule (`debrief_add`, `story_commit`, `frame_update`) repeat it in one line of their description.
- Server instructions stay under 4,096 characters: the standing rules plus "load the procedure with `skill`".

## The `find` contract

- **Search:** `query` is matched word by word (case-insensitive, stop words dropped) against:
  - entity names, aliases, and property values;
  - change sources (the quote and why, with basis);
  - scene titles, places, and summaries;
  - transcript utterances (session, timestamp, speaker).
- **List:** no query lists every entity (optionally only some `kinds`) and scene, with refs. This is how a client sees what exists before a debrief. Default limit: 10 for a search, 100 for a list.
- **Output:** `{query, total, hits: [{ref, type, title, snippet?, score?}]}`, ranked. Each `ref` feeds `get`. A claim shows its basis, so "Sela claims..." stays a claim.
- **`get` refs:** `overview`, `schema`, `frame`, `entity:<id>` (with history), `session:<id>`, `scene:<session>/<n>` (with its transcript), `transcript:<session>[@<timestamp>]` (a window around the timestamp), and `debrief:<session>` (the draft). An unknown ref is rejected with this list.
- **Real build:** a Convex search index over one denormalized search-text field per row (entities, scenes, transcript utterances, history sources), keyword relevance, no embeddings in v1.

## Transcript upload per client

| Client | Path | Measured |
| --- | --- | --- |
| Claude Code CLI | Signed upload URL (PUT, single use, about 10 min), sent with `curl -T` from the shell | 12/12 byte-exact, transcript never in model output, about 95k tokens |
| Codex CLI | Same | 12/12 byte-exact, never in model output, about 215k tokens |
| Claude Desktop, claude.ai (no shell) | Upload page behind AuthKit sign-in; the tool returns the link, the GM drops the file, the model continues | Simulated (GM upload faked by the harness): 6/6, 270k-550k tokens over two turns |

`transcript_upload_url` should return both the signed URL and the page link. The model uses the URL when it has a shell and hands the GM the page otherwise. A file picker inside the MCP Apps view, posting to the signed URL, would spare Desktop users the extra page; that is not verified.

## Caveats

- **The tasks were easy for both models.** The invented transcript is about 26 minutes long and clean. A real session (#7) is longer and messier, and that is where the procedures earned their place. The gold checks measure state, not the quality of the GM-facing draft.
- **Token baselines differ by client.** Codex's own system prompt is about 14k tokens and Claude Code's about 2k in this isolated setup. Compare surfaces within one client.
- **The upload page path was simulated.** No real sign-in, and no Desktop or claude.ai run.
