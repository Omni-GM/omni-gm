- verify with a real client: A change an AI client drives is verified by an actual headless client against a branch preview, and its recording and an independent readback are kept as proof.
  when: command tsx scripts/verify-*
  step: deploy the branch to a preview and sign in with the staging machine identity, never production
    leaves: the preview deploy log
  step: run the real client headless through the matching scripts/verify-*.ts, with only the tools the target client has
    leaves: the client's recording as JSONL
  step: read the result back through an independent SDK client, not through the agent's own words
    leaves: the readback log
  step: strip upload capabilities, unrelated provider usage and thinking blocks before the recording is committed
  pitfall: the hosted maximum upload first failed on the deployment's write rate; the failure and its diagnosis stay in the proof beside the passing reruns (82619fe)
  pitfall: a verifier regex missed curl's combined -sT flags and was kept as an authoring error, not a failure of the agent (82619fe)
  learned: 82619fe, 94d9e81, 6f95611
  because: tests through convex-test cannot show what a real client does with the tool descriptions and skills; only a recorded run can
