import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("artifact guard handles spaces and fails closed before any server starts", () => {
  const root = mkdtempSync(join(tmpdir(), "liftgo group c guard "));
  const source = `import { assertGroupCFakeBuild } from ${JSON.stringify(pathToFileURL(resolve("tests/design-group-c/artifactGuard.ts")).href)}; assertGroupCFakeBuild();`;
  const run = () => spawnSync(process.execPath, ["--input-type=module", "--eval", source], { env: { ...process.env, GROUP_C_BUILD_DIR: root }, encoding: "utf8", shell: false });
  try {
    assert.notEqual(run().status, 0, "missing build must fail");
    mkdirSync(join(root, "dist/server"), { recursive: true });
    const config = join(root, "dist/server/wrangler.json");
    writeFileSync(config, "{}");
    assert.notEqual(run().status, 0, "unidentified build must fail");
    writeFileSync(config, JSON.stringify({ fixture: "smoke-placeholder", target: "http://127.0.0.1:54321" }));
    assert.equal(run().status, 0, "fake build in a path with spaces must pass");
    writeFileSync(join(root, "dist/server/productive.js"), "zxefrzfaynnfwazqhwxp");
    assert.notEqual(run().status, 0, "productive reference must fail");
    rmSync(join(root, "dist/server/productive.js"));
    writeFileSync(join(root, ".dev.vars"), "FIXTURE_SENTINEL_MUST_NOT_BE_READ");
    const blocked = run();
    assert.notEqual(blocked.status, 0, "dev-secret file names must fail");
    assert.equal(blocked.stderr.includes("FIXTURE_SENTINEL_MUST_NOT_BE_READ"), false);
    rmSync(join(root, ".dev.vars"));
    writeFileSync(join(root, ".env"), "FIXTURE_ENV_SENTINEL_MUST_NOT_BE_READ");
    assert.notEqual(run().status, 0, "build-root dotenv names must fail");
    rmSync(join(root, ".env"));
    writeFileSync(join(root, "dist/server/.env.json"), "FIXTURE_ENV_SENTINEL_MUST_NOT_BE_READ");
    const nested = run();
    assert.notEqual(nested.status, 0, "nested dotenv names must fail before content reads");
    assert.equal(nested.stderr.includes("FIXTURE_ENV_SENTINEL_MUST_NOT_BE_READ"), false);
  } finally {
    // root is the exact unique temporary directory returned by mkdtempSync.
    rmSync(root, { recursive: true, force: true });
  }
});
