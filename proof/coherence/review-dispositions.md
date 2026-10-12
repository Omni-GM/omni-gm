# Review dispositions

Cross-family review: Codex `adversarial-review` with GPT-6.1 Sol at high effort, read-only, on 9dc3abc. It found no production-code vulnerability, confirmed every refutation, the verbatim lexicon migration, the four `control: none` reasons and `testMatch`, and raised five findings. All five held against the code and are fixed.

| Finding | Disposition |
| --- | --- |
| P2: CI ran `--form chokepoint`, so a renamed or deleted oracle test left Coherence green | Fixed: the workflow runs every enforcement. A probe that renamed one `via:` title made the step exit 1 (4 pass, 1 fail). |
| P2: the secret oracle's `over:` misdescribed who fixes from a foreign story commit | Fixed: it names the stranger's reads, changes, fixes, drops and foreign entity link, and the owner's fix from the stranger's story commit. |
| P3: the OAuth discovery entrance named the router `http` as its handler | Fixed: the inline action is now `protectedResourceMetadata` in `convex/http.ts`, with no behavior change, and the entrance names it. |
| P3: "no work is queued" was false; upload calls schedule expiry and cleanup | Fixed: the dismissal says isolation is decided inside the call, and the scheduled work acts only on that owner's upload by its id. |
| P3: the operator level claimed every script uses a deploy key | Fixed: the walks and verifications sign in as an invented game master with `OMNI_GM_ACCESS_TOKEN`; only codegen and deploy use a deploy key. |
