# Scorecard: which MCP tool surface helps the AI most?

Throwaway prototype for Omni-GM ticket #10. 11 task runs plus 0 upload-page runs, invented data only.
Surfaces: **A** few deep tools (spec draft), **B** many narrow verbs, **C** narrow writes + `find`/`get` + `skill` tool, **D** C without `skill`, procedures in server instructions.

## Overall, per client and surface

| Client | Surface | Success | Check score | Calls/task | Rejected/task | Invalid/task | Input tokens/task | Output tokens/task | Rule breaks | Errors |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | A | 100% (2) | 100% | 9.5 | 0.0 | 0.0 | 174k | 8k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | B | 100% (1) | 100% | 5.0 | 0.0 | 0.0 | 99k | 2k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | C | 100% (2) | 100% | 7.0 | 0.0 | 0.0 | 85k | 2k | 0 | 0 |
| Sonnet 5.5 (Claude Code) | D | 100% (1) | 100% | 4.0 | 0.0 | 0.0 | 74k | 2k | 0 | 0 |
| GPT-6.1 Sol (Codex) | A | 100% (1) | 100% | 6.0 | 0.0 | 0.0 | 145k | 1k | 0 | 0 |
| GPT-6.1 Sol (Codex) | B | 100% (1) | 100% | 6.0 | 0.0 | 0.0 | 217k | 1k | 0 | 0 |
| GPT-6.1 Sol (Codex) | C | 100% (2) | 100% | 11.0 | 0.5 | 0.0 | 202k | 1k | 0 | 0 |
| GPT-6.1 Sol (Codex) | D | 100% (1) | 100% | 9.0 | 2.0 | 0.0 | 309k | 2k | 0 | 0 |

## Both clients together, per surface

| Surface | Success | Check score | Calls/task | Rejected/task | Rule breaks |
|---|---:|---:|---:|---:|---:|
| A | 100% (3) | 100% | 8.3 | 0.0 | 0 |
| B | 100% (2) | 100% | 5.5 | 0.0 | 0 |
| C | 100% (4) | 100% | 9.0 | 0.3 | 0 |
| D | 100% (2) | 100% | 6.5 | 1.0 | 0 |

## Success per task (passed runs / runs)

| Client | Surface | T1 upload + scenes | T2 debrief | T3 prep questions | T4 plank answer | T5 frame update | T6 fix mistake |
|---|---|---:|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | A | 1/1 | 1/1 | – | – | – | – |
| Sonnet 5.5 (Claude Code) | B | 1/1 | – | – | – | – | – |
| Sonnet 5.5 (Claude Code) | C | 1/1 | – | – | – | – | 1/1 |
| Sonnet 5.5 (Claude Code) | D | 1/1 | – | – | – | – | – |
| GPT-6.1 Sol (Codex) | A | 1/1 | – | – | – | – | – |
| GPT-6.1 Sol (Codex) | B | 1/1 | – | – | – | – | – |
| GPT-6.1 Sol (Codex) | C | 1/1 | – | – | – | – | 1/1 |
| GPT-6.1 Sol (Codex) | D | 1/1 | – | – | – | – | – |

## Skill loading on surface C (expected procedure loaded before the first write, unprompted)

| Client | T1 (upload + scenes) | T2 (debrief) | T3 (prep questions) | T4 (plank answer) | T5 (frame update) |
|---|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | 1/1 | – | – | – | – |
| GPT-6.1 Sol (Codex) | 1/1 | – | – | – | – |

## Upload paths per client

| Client | Path | Success | Transcript through model output | Input tokens/run | Output tokens/run | Minutes/run |
|---|---|---:|---:|---:|---:|---:|
| Sonnet 5.5 (Claude Code) | signed upload URL (all surfaces) | 4/4 stored, 4/4 full task | 0/4 | 91k | 2k | 0.3 |
| Sonnet 5.5 (Claude Code) | upload page behind sign-in (C, GM uploads) | 0/0 stored, 0/0 full task | 0/0 | – | – | – |
| GPT-6.1 Sol (Codex) | signed upload URL (all surfaces) | 4/4 stored, 4/4 full task | 0/4 | 214k | 1k | 0.8 |
| GPT-6.1 Sol (Codex) | upload page behind sign-in (C, GM uploads) | 0/0 stored, 0/0 full task | 0/0 | – | – | – |

## Failed critical checks (count of runs)


## Rule breaks

