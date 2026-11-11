import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TSLIB_URL = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
const TSLIB_SHA256 = "0929993220938091ede542d688b0fdb87dad99a7e77678e1983c32d18a503339";
const vendor = new URL("./vendor/tslib-2.8.1.mjs", import.meta.url);

export function offlineImportMap(config, bytes, vendorURL = vendor.href) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), TSLIB_SHA256, "Vendored tslib must match the reviewed upstream source");
  assert(config.imports && !Array.isArray(config.imports), "Expected the current Deno imports");
  assert(Object.values(config.imports).every(value => typeof value === "string"));
  assert.equal(new URL(vendorURL).protocol, "file:");
  return { imports: { ...config.imports, [TSLIB_URL]: vendorURL }, ...(config.scopes ? { scopes: config.scopes } : {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2] && path.isAbsolute(process.argv[2]), "Expected the temporary import-map path");
  const config = JSON.parse(fs.readFileSync(new URL("../../supabase/functions/deno.json", import.meta.url), "utf8"));
  fs.writeFileSync(process.argv[2], JSON.stringify(offlineImportMap(config, fs.readFileSync(vendor)), null, 2) + "\n");
  console.log("Deno CI: verified official tslib 2.8.1; remaining remote imports use the frozen lock");
}
