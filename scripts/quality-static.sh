#!/usr/bin/env bash
set -euo pipefail
node --test scripts/tests/release-identity.test.mjs
node --test scripts/tests/eslint-guardrails.test.mjs
node --test scripts/tests/feature-imports.test.mjs scripts/tests/vitest-blob-provenance.test.mjs scripts/tests/browser-typecheck.test.mjs
node --test scripts/tests/lint-migrations.test.mjs

node --test scripts/tests/quality-workflow.test.mjs scripts/tests/quality-producer.test.mjs
python3 -m unittest discover -s scripts/tests -p test_playwright_apt_cache.py
python3 -m unittest discover -s scripts/tests -p test_browser_acceptance_runner.py

node --test tests/offlineTeardown.test.mjs tests/design-group-c/artifactGuard.test.mjs
bun run lint --max-warnings=0
node node_modules/eslint/bin/eslint.js --config eslint.group-c-design.config.mjs --max-warnings=0 tests/design-group-c tests/offlineTeardown.ts tests/offlineTeardown.test.mjs playwright.group-c-design.config.ts playwright.group-c-component.config.ts vite.group-c-fixture.config.ts
bun run typecheck
bun run typecheck:browser-tests
bash scripts/arch-check.sh
