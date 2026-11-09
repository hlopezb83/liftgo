#!/usr/bin/env bash
set -euo pipefail
node scripts/browser-test-server.mjs --build-only
node --test scripts/tests/browser-test-*.test.mjs
SMOKE_REUSE_BUILD=1 bunx playwright test --config playwright.smoke.config.ts
