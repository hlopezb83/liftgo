# Signature capture engine migration

Scope: replace the manual canvas engine in `SignaturePad` with `signature_pad@5.1.4`.
The public `onSave(base64)` contract, explicit confirmation, white-background PNG,
`onClear`, delivery dialog's pending/minimum-hours guards, and signature storage
remain unchanged. Single-point taps now count as ink (the upstream engine draws a dot).
Black ink on white deliberately keeps exported signatures legible in either UI theme.

- Clear and undo operate on vector stroke groups instead of full-canvas ImageData copies.
- ResizeObserver handles container resizing; window resize also catches DPR changes.
  Zero-size/hidden canvases are left intact. Existing points are rescaled to the new
  CSS rectangle and redrawn at device-pixel resolution without losing undo history.
- Disabled/unmounted pads detach engine listeners. Interrupted pointer ownership is
  reset before re-enabling, clearing, undoing, or redrawing. Throttling is disabled
  to prevent a queued stroke update after a pending save disables capture.
- No consent rules, backend code, database schema, stored images, or fiscal operations change.

## Dependency review (2026-10-31)

- Official release: https://github.com/szimek/signature_pad/releases/tag/v5.1.4
  (2026-07-31; includes two-point redraw correction).
- Official API: https://github.com/szimek/signature_pad
- Official security page: https://github.com/szimek/signature_pad/security
  No published advisories were listed; no SECURITY.md policy was present.
  This observation is not proof that vulnerabilities do not exist.
- MIT; built-in TypeScript declarations; no runtime dependencies or install lifecycle scripts.
- Exact version pinned, registry integrity preserved in Bun-generated lock. Final lock
  regenerated with Bun 1.4.4; frozen install with scripts disabled preserved its hash.

## Local checks

The focused unit suite uses the **real library** with mocked canvas rasterization and
layout: PNG API, empty/clear/undo, mouse/touch/pen pointer events, resize/DPR/hidden
containers, disabled and interrupted gestures, cancellation, StrictMode, cleanup,
and delivery consumer guards. It does not simulate actual Safari/iOS hardware.

Commands:

```sh
bun install --frozen-lockfile --ignore-scripts
node node_modules/vitest/vitest.mjs run \
  src/features/contracts/components/contracts/__tests__/SignaturePad.test.tsx \
  src/features/deliveries/components/deliveries/__tests__/DeliverySignatureDialog.pending.test.tsx \
  src/features/deliveries/components/deliveries/__tests__/DeliverySignatureDialog.transport.test.tsx
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node scripts/gen-version.mjs
node node_modules/vite/bin/vite.js build
```

A separate isolated Chromium raster/PNG fixture was attempted but the environment
rejected browser launch (`socket() failed: Operation not permitted`) before tests
ran. Visual PNG, actual mobile touch/stylus and Safari/iOS acceptance remain pending
in a permitted browser environment. No deployment or merge is part of this work.

`tests/design-group-c/component/signature.spec.ts` adds raster/PNG decoding,
DPR=2 responsive redraw/undo, disabled controls and native touch-dot/clear checks
to the existing isolated component harness run by CI. It uses the existing
loopback-only proxy and teardown network assertions without widening access.
Browser execution remains unverified locally; the CI result must be checked.
