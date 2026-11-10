# tslib 2.8.1 for offline Deno tests

`tslib-2.8.1.mjs` is the unchanged `tslib.es6.mjs` from Microsoft/tslib commit
`d72d6f70b36286bc3f94a3dda1e64dcb568b1370` (tag `v2.8.1`). The upstream
copyright and license remain at the top of the file.

Source: https://raw.githubusercontent.com/microsoft/tslib/d72d6f70b36286bc3f94a3dda1e64dcb568b1370/tslib.es6.mjs

SHA-256: `0929993220938091ede542d688b0fdb87dad99a7e77678e1983c32d18a503339`.

The CDN alternated two compiled representations at the same versioned URL.
The offline test harness maps only that exact URL to this reviewed local ES
module. It derives every other alias from the current Deno manifest and keeps
the existing frozen lock. Production imports and configuration are unchanged.
The generator refuses modified vendor bytes. Do not format this upstream file.

See `docs/qa/ci-tslib-integrity-2026-11-09.json` for verification details.
