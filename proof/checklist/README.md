# Checklist and template proof

Invented data only. The behavior seams are JSON-RPC through the MCP HTTP
endpoint in `convex-test`, and a headless Claude Opus 5.5 client on a staging
preview with independent MCP SDK readback. No test calls domain functions or
reads tables.

## Endpoint proof

`tests/checklist.test.ts` drives the public tools:

- [Store red](01-red-store.log) and [green](01-green-store.log): an unset
  checklist, ordered names and definitions, exact markdown, a second client
  reading it, and retention when a new adventure starts.
- [History red](02-red-history.log) and [green](02-green-history.log): a whole
  replacement retains both versions and their reasons, including the initial
  `before: null`; history continues across pages and overview lists the commits.
- [Empty checklist red](03-red-empty.log) and [green](03-green-empty.log).
- [Validation red](04-red-validation.log) and [green](04-green-validation.log):
  blank names, definitions, template or reason, and duplicate names ignoring
  surrounding whitespace and case. Every rejection preserves current data
  and history.
- [Size red](05-red-bounds.log) and [green](05-green-bounds.log): exactly
  32,000 UTF-8 JSON bytes are accepted; one more byte, oversized multibyte
  markdown, definitions or reason are rejected without writing.
- [Green isolation](06-green-procedure-isolation.log): another owner has a
  separate checklist and history, cannot use a foreign
  continuation, and cannot spoof the authenticated caller. An extra `caller`
  argument is overwritten by the gateway, so it writes only the sender's
  own campaign. Too many sections and malformed sections leave an unset
  checklist and its commits untouched. This isolation and validator coverage
  is green-only because the reused gateway rules already worked.

[06-red-procedure.log](06-red-procedure.log) and the corresponding green log
also contain the initial procedure-wording test. Review found it contrary
to spec #35, so that test was removed. The headless conversation and SDK
readback below prove the procedure's behavior; no new wording test remains.

[check.log](check.log) is the full local gate: Ledger build, Biome, isolated
anonymous-local Convex codegen, both TypeScript projects, and all endpoint
tests without skips.

`setup-missing-ledger.log` records the first run before the required Ledger
build. It is a setup failure, not behavior red.
`isolation-test-authoring-error.log` records the first isolation assertion
expecting the gateway to reject a supplied caller. The actual contract
overwrites it with the authenticated caller. The corrected test checks that
the write lands only in the sender's campaign and leaves the other owner's
history unchanged.
`check-initial.log` records a return-type inference error; the mutation now
declares the result-validator type, matching the existing gateway pattern.

## Hosted compatibility and SDK proof

[sdk-baseline-deploy.log](sdk-baseline-deploy.log) deploys unchanged main
`94d9e8183996af7e177c5cc9d238a2f19bb20bea` to the branch preview
`checklist-38-sdk`, at `calculating-cardinal-244.convex.site`.
[sdk-baseline-seed.log](sdk-baseline-seed.log) uses the existing invented
Tallow Mill fixture with its transcript, scenes and committed story state.
[sdk-before-upgrade.log](sdk-before-upgrade.log) captures
[the MCP readback](sdk-before-upgrade.json).

[sdk-upgrade-deploy.log](sdk-upgrade-deploy.log) deploys the additive checklist
table, optional commit payload and new commit kind over those existing rows.
[sdk-after-upgrade.log](sdk-after-upgrade.log) proves all earlier adventures,
sessions, entities, frame, schema and non-checklist history still read back
identically, with the new checklist unset.

[sdk-e2e.log](sdk-e2e.log) and [sdk-repeat.log](sdk-repeat.log) use the official
MCP SDK with staging M2M authentication. Both runs store, replace and read the
ordered checklist and template, check before/after versions and reasons,
reject invalid and oversized input without a write, and prove all earlier
story state, sessions, frame and schema unchanged. The script follows history
continuations and is repeatable on that preview.

## Headless no-vault proof

[headless-preview-deploy.log](headless-preview-deploy.log) identifies a fresh
branch preview, separate from SDK proof.
[headless-seed.log](headless-seed.log) seeds the same invented story-state
fixture. [headless-before.log](headless-before.log) captures
[the independent snapshot](headless-before.json) with no checklist.

[claude.jsonl](claude.jsonl) contains eight turns, with user input, assistant
text, tool calls/results and completion status. The first seven turns share
one client conversation; the eighth starts a fresh conversation. The client
runs outside the repository in an empty directory with no vault. Built-in
tools and hooks are disabled, and only the supplied Omni-GM MCP endpoint is
connected. The neutral system prompt tells it to load the served procedure;
it contains no section-walk rules. Provider session IDs, thinking and usage
are omitted from the public transcript.

The inputs are `fixtures/checklist-start.md`, `checklist-supply.md`,
`checklist-launch-pick.md`, `checklist-to-discoveries.md`,
`checklist-discoveries-pick.md`, `checklist-to-supplies.md`,
`checklist-finish.md`, then `checklist-fresh-client.md`.

[headless-readback.log](headless-readback.log) verifies the conversation and
reads the store through a fresh SDK connection:

- the procedure is loaded and the missing checklist is read before asking;
- the game master supplies it once, and exactly one `checklist_set` stores it
  with the supplied reason and confirms it before the walk;
- sections are walked in the stored order, Launch, Discoveries, Supplies;
- Launch's definition gives exactly two sourced opening situations,
  Discoveries gives ten short sourced clues, and the mechanical Supplies
  section has no pitches and uses the game master's materials;
- a fresh client reads the stored checklist, starts Launch with its two
  pitches, limits unused history to one version, and never asks for the
  checklist or template again;
- [the checklist readback](headless-checklist.json) keeps the supplied
  definitions, case, internal line breaks and template, with one history
  record; all earlier story state, frame, schema and sessions are unchanged;
- [the assembled session note](session-note.md) uses the stored template
  headings in order.

This proves checklist reuse across clients, not persistent note entries or
resume progress. Those belong to the session-note ticket. It proves one
model run, not that every model always follows a procedure.

Review tightened the first-heading order check and changed the served walk
to read `get checklist` with `limit: 1`. The first seven turns already prove
the setup and complete walk; the fresh-client eighth turn was rerun against
the updated procedure and verifies that limit. The earlier eighth turn is
retained in `fresh-client-before-review.jsonl`.

`readback-batch-parser-error.log` and `readback-phrase-parser-error.log` retain
two verifier errors on the final conversation. A batched `get` containing
`checklist` is a valid confirmation; the parser now recognizes it. The phrase
"built only from your picks" is not a "Built on" pitch citation; the check now
uses word boundaries. Neither correction changes the behavior being checked.

### Rejected attempt

[rejected-attempt-1.jsonl](rejected-attempt-1.jsonl), its deployment, seed,
before snapshot and readback log are retained. The first verifier stopped
at its source check. Inspection also found a clue citing only a descriptive
fragment and definitions whose initial letters had been capitalized. The
procedure now explicitly preserves names, definitions and template verbatim,
and requires a timestamp or stored entity name for sources. The template
fixture now uses a Markdown fence to identify its content. The final run is
on a fresh preview and keeps the definitions' supplied case. The verifier
accepts a timestamp anywhere inside a source citation, while still rejecting
the descriptive-fragment source, and checks clues at at most 45 words after
their source citation is removed.

## Reproduce

Load credentials with `~/.config/omni-gm/lib.sh` and `load_env`, never by
sourcing `secrets.env`. Deploy only staging branch previews, using
`CONVEX_PREVIEW_DEPLOY_KEY` and `convex deploy --preview-create <name>`.
Set `OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN` to that preview and a staging
M2M access token.

```sh
pnpm check
pnpm exec tsx scripts/checklist-e2e.ts
```

For headless proof, use a fresh preview:

```sh
pnpm exec tsx scripts/briefing-e2e.ts
pnpm exec tsx scripts/checklist-e2e.ts --headless-before
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions --disable-slash-commands \
  --verbose --output-format stream-json < fixtures/checklist-start.md
```

Continue that conversation with `--resume <private-session-id>` for the next
six fixture inputs, then start a new conversation for `checklist-fresh-client.md`.
Use an empty working directory, with fixture files supplied by absolute path.
The private MCP configuration holds only the preview URL and staging bearer
token and is removed afterward. Keep the eight user inputs and the visible
conversation events as `claude.jsonl`, tagged with their `turn` number, then run:

```sh
pnpm exec tsx scripts/checklist-e2e.ts --headless-after
```

Compatibility proof uses `--before-upgrade` on an existing seeded preview,
deploys the new schema, then runs `--after-upgrade`. Each assertion compares
public MCP reads, never tables.
