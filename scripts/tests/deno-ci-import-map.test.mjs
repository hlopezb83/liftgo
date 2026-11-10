import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { offlineImportMap, TSLIB_URL } from "../ci/deno-import-map.mjs";

const config = JSON.parse(fs.readFileSync("supabase/functions/deno.json", "utf8"));
const bytes = fs.readFileSync("scripts/ci/vendor/tslib-2.8.1.mjs");

test("offline import map preserves every current SDK alias and changes only the unstable tslib URL", () => {
  const map = offlineImportMap(config, bytes);
  for (const [key, value] of Object.entries(config.imports)) assert.equal(map.imports[key], value);
  assert.equal(Object.keys(map.imports).length, Object.keys(config.imports).length + 1);
  assert.equal(new URL(map.imports[TSLIB_URL]).protocol, "file:");
  assert.ok(map.imports[TSLIB_URL].endsWith("/vendor/tslib-2.8.1.mjs"));
  assert.deepEqual(offlineImportMap({ ...config, scopes: { local: { fixture: "file:///fixture.mjs" } } }, bytes).scopes,
    { local: { fixture: "file:///fixture.mjs" } });
});

test("a changed vendor file or remote override fails before an import map is written", () => {
  assert.throws(() => offlineImportMap(config, Buffer.concat([bytes, Buffer.from("\n")])), /reviewed upstream/);
  assert.throws(() => offlineImportMap(config, bytes, "https://outside.invalid/tslib.mjs"));
});
