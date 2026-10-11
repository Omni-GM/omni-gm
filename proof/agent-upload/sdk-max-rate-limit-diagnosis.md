# Hosted maximum failure

The integrated preview's first refreshed 8,000,000-byte run failed at final publication. The unchanged client assertion is preserved in [the failed run](sdk-max-rate-limit-failure.log).

Convex deployment logs for that run identified `uploads:append` as the failure:

```text
Too many writes per second. Your deployment is limited to 4 MiB bytes written per second. Reduce your write rate or upgrade to a larger deployment.
```

The action had parsed and stored the file, then exceeded the preview's database write throughput while inserting utterance batches. The catch aborted staging and returned the tool's automatic retry guidance. This was a real hosted failure, not a fixture mistake or an 8 MB memory ceiling.

The shared signed/chunk pipeline now retries only this explicit rejected-write error, with bounded 1, 2 and 4 second backoffs per batch. It does not retry unknown errors or potentially completed mutations. Existing token and batch-order checks still govern cancellation. Retry logging contains no input, capability, transcript or owner data.

Two simultaneous maximum uploads [A](sdk-max-concurrent-a.log) and [B](sdk-max-concurrent-b.log) exercise the real rate rejection on hosted Convex. The [whitelisted server excerpts](sdk-max-rate-limit-recovery.jsonl) retain only function names, errors and log messages. They show five rejected batches and corresponding automatic retries; both final actions complete without an error. Independent SDK pagination and authenticated downloads confirm all 8,000,000 original bytes and 4,801 utterances in both sessions.
