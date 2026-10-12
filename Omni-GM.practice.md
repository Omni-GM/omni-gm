- prove a slice red then green: Each acceptance in a change has a failing run kept from before the fix and a passing run after it, linked from the slice's proof table.
  when: edit proof/**/*
  step: write the acceptance's test through the outside seam (the MCP endpoint, the signed routes, a real client), never an internal function or a table read
  step: run it before the fix and keep the failing output as proof/<slice>/<nn>-red-<acceptance>.log
    leaves: the red log
  step: make it pass and keep the output as proof/<slice>/<nn>-green-<acceptance>.log
    leaves: the green log
  step: link both from the acceptance table in proof/<slice>/README.md; a guard that was green from the start says so instead of claiming a red
    leaves: the table row
  step: keep a mistaken test, fixture or verifier as its own authoring-error log, never as red evidence
  pitfall: a fixture padded to 8,000,005 bytes was rejected as over the limit; it was kept as an authoring-error log so it could not pass for a red run (82619fe)
  pitfall: shared-pipeline guards were already green after the first implementation; the table says so rather than claiming a failing history (82619fe)
  learned: 3a41cb1, 82619fe, 4a31073
  because: a reviewer reads the proof table, not the session; a green without its red shows nothing the change caused
