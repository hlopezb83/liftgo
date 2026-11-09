# Invoice QA follow-up reconstruction

Base: `841e31484a50e196c14e85dbe7ad5e93119db734`.

Six source/test blobs were recovered byte-for-byte from Git tree `2e9c8da4bf4afab31eb2e06797e4af8b571aa21f`. Their original base was `3027d504e6ea0c63d79f15fbc8989c054ca305db`; the three existing production files were unchanged between that base and this reconstruction base. The later local commit `5292d21` is unavailable, so the form callback and its integration tests were reconstructed and reviewed anew. This is not claimed to be the identical historical commit.

- Show 8% only when already configured; preserve global tax choices [16, 0], the 16% default and the legacy-11 warning. No automatic tax conversion.
- Explain only the known sale duplicate constraint/message; unrelated unique errors are not reclassified.
- Forward non-assignment business blocks to visible warning feedback. Keep the dedicated sale-assignment UI.
- Offline HTTP tests use the real customer query/selector with 501/500 pagination and a selected customer outside the list, preserving its fiscal snapshot. These do not certify live RLS or fiscal policy.

SAT sale policy is a separate reconstruction. This change performs no fiscal operation, migration or business-data write. Remote commit authorization remains blocked by the prior denial; no alternate upload path is used. Full canonical CI remains pending until authorized integration.
