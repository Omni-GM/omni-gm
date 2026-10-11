# Scorecard: which MCP tool surface helps the AI most?

Throwaway prototype for Omni-GM ticket #10. 168 task runs plus 6 upload-page runs, invented data only.
Surfaces: **A** few deep tools (spec draft), **B** many narrow verbs, **C** narrow writes + `find`/`get` + `skill` tool, **D** C without `skill`, procedures in server instructions, **E** C plus the contract fixes the first matrix pointed at (`find` lists with no query, `get` takes several refs, refs explained on error, tolerant skill names, standing rules inside every procedure and the write tools).

## Overall, per client and surface

| Client | Surface | Success | Check score | Calls/task | Rejected/task | Invalid/task | Input tokens/task | Output tokens/task | Rule breaks | Errors |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | A | 100% (21) | 100% | 8.6 | 0.1 | 0.0 | 102k | 4k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | B | 100% (21) | 99% | 12.3 | 0.0 | 0.0 | 120k | 4k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | C | 100% (21) | 100% | 9.3 | 0.2 | 0.0 | 118k | 4k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | D | 100% (21) | 100% | 7.6 | 0.1 | 0.1 | 116k | 4k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | E | – (0) | – | – | – | – | – | – | 0 | 0 |
| GPT-6.1 Sol (Codex) | A | 100% (21) | 99% | 10.3 | 0.1 | 0.0 | 201k | 2k | 0 | 0 |
| GPT-6.1 Sol (Codex) | B | 100% (21) | 98% | 16.0 | 0.0 | 0.0 | 229k | 3k | 0 | 0 |
| GPT-6.1 Sol (Codex) | C | 100% (21) | 100% | 15.2 | 0.5 | 0.1 | 277k | 3k | 0 | 0 |
| GPT-6.1 Sol (Codex) | D | 100% (21) | 100% | 12.7 | 1.0 | 0.3 | 333k | 3k | 0 | 1 |
| GPT-6.1 Sol (Codex) | E | – (0) | – | – | – | – | – | – | 0 | 0 |

## Both clients together, per surface

| Surface | Success | Check score | Calls/task | Rejected/task | Rule breaks |
|---|---:|---:|---:|---:|---:|
| A | 100% (42) | 99% | 9.5 | 0.1 | 0 |
| B | 100% (42) | 98% | 14.2 | 0.0 | 0 |
| C | 100% (42) | 100% | 12.3 | 0.4 | 0 |
| D | 100% (42) | 100% | 10.1 | 0.5 | 0 |
| E | – (0) | – | – | – | 0 |

## Success per task (passed runs / runs)

| Client | Surface | T1 upload + scenes | T2 debrief | T3 prep questions | T4 plank answer | T5 frame update | T6 fix mistake | T7 guess trap |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | A | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Sonnet 5.5 (Claude Code) | B | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Sonnet 5.5 (Claude Code) | C | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Sonnet 5.5 (Claude Code) | D | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Sonnet 5.5 (Claude Code) | E | – | – | – | – | – | – | – |
| GPT-6.1 Sol (Codex) | A | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GPT-6.1 Sol (Codex) | B | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GPT-6.1 Sol (Codex) | C | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GPT-6.1 Sol (Codex) | D | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GPT-6.1 Sol (Codex) | E | – | – | – | – | – | – | – |

## Skill loading on surfaces C and E (expected procedure loaded before the first write, unprompted)

| Client | Surface | T1 (upload + scenes) | T2 (debrief) | T3 (prep questions) | T4 (plank answer) | T5 (frame update) |
|---|---|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | C | 3/3 | 3/3 | 2/3 | 3/3 | 3/3 |
| Sonnet 5.5 (Claude Code) | E | – | – | – | – | – |
| GPT-6.1 Sol (Codex) | C | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| GPT-6.1 Sol (Codex) | E | – | – | – | – | – |

## Upload paths per client

| Client | Path | Success | Transcript through model output | Input tokens/run | Output tokens/run | Minutes/run |
|---|---|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | signed upload URL (all surfaces) | 12/12 stored, 12/12 full task | 0/12 | 95k | 2k | 0.3 |
| Sonnet 5.5 (Claude Code) | upload page behind sign-in (C, GM uploads) | 3/3 stored, 3/3 full task | 0/3 | 272k | 7k | 0.5 |
| GPT-6.1 Sol (Codex) | signed upload URL (all surfaces) | 12/12 stored, 12/12 full task | 0/12 | 215k | 1k | 0.8 |
| GPT-6.1 Sol (Codex) | upload page behind sign-in (C, GM uploads) | 3/3 stored, 3/3 full task | 0/3 | 554k | 5k | 2.4 |

## Rejected calls by cause (all runs, both clients)

| Cause | A | B | C | D | E |
|---|---:|---:|---:|---:|---:|
| write to a committed debrief or its scenes | 4 | 0 | 5 | 3 | 0 |
| order: no transcript or scenes yet | 0 | 0 | 5 | 0 | 0 |
| find: query without meaningful words | 0 | 0 | 6 | 6 | 0 |
| input schema (wrong type, limit, missing field) | 1 | 0 | 3 | 8 | 0 |
| get or entity: unknown ref | 0 | 0 | 0 | 6 | 0 |
| skill: unknown procedure name | 0 | 0 | 2 | 0 | 0 |

MCP prompts fetched by a client in any run: 0.

## Failed critical checks (count of runs)


## Rule breaks

