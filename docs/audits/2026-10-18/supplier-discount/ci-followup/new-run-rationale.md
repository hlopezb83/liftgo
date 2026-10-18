# CI follow-up: original failure and stale merge artifact

The original CI run `39174304148` on head `a7704ca0aa35a55243f3fa6469a91809364e14d5` failed in shard 5/6, job `117813688771`: the existing bank keyboard test exceeded its global 5000ms timeout (5364ms). The diagnosis and unchanged blob comparisons are preserved here; full logs remain local and in the original Actions jobs. There was no assertion mismatch, and no bank product or test change was made.

The coordinator requested a rerun of only that failed job. The new shard-5 job `117814636578` passed 588/588 and uploaded blob artifact `12154021554`. However, merge job `117815075412` downloaded the older failed artifact `12154135730`, with the same `vitest-blob-5` name, and replayed its old failure. Its report is not evidence of a new test execution or a coverage-threshold failure. Logs and artifact/run/job metadata are preserved in `merge-rerun-*`.

Blindly retrying that merge would not select the correct artifact reliably. The documentation-only follow-up records the failed original and successful shard retry, and creates a fresh CI run with a new run ID and no artifacts from earlier attempts. It does not change the proposed SQL/client patch or any executable product, bank test or workflow. The new CI must be evaluated on its own exact head; it is not declared successful in advance.

Automatic approval review rejected publication of the additional full raw CI logs because of possible internal/sensitive content. They are not uploaded. The earlier raw text copy is removed from the current diff (it remains in the prior commit); local originals are preserved under `audit-baseline/docs/audits/2026-10-18/bank-timeout-followup`. Only this diagnosis, metadata, hashes and original job links are delivered here:

| Job | Original source | Local log SHA-256 |
| --- | --- | --- |
| Original shard | [117813688771](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117813688771) | `5e54df7642f91842c622aa4717afac3f628bc6c1eac1124edb262ad3f584c8cf` |
| Shard retry | [117814636578](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117814636578) | `d4edb8faf639052c659668fc296bc61586c209d28ab30e36af1c836c3ee39d35` |
| Failed merge | [117815075412](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117815075412) | `dcf1f3ac71db3995f81bd44f8b36a12f32f6b9cde3b51f19af8fd3809313b02a` |

The timing diagnosis remains a hypothesis supported by the unchanged test's 40 repeated keyboard actions and role queries under coverage, and earlier isolated baseline timings near the default timeout. A focused test improvement can reduce redundant navigation while preserving its assertions in a separate review; no arbitrary bank logic change belongs in K1.
