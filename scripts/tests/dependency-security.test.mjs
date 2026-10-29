import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Run with: node --test scripts/tests/dependency-security.test.mjs
// These tests use installed consumer resolution, not only bun.lock. An
// incremental install can leave stale nested packages despite a clean audit.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../package.json", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const coreRequire = createRequire(require.resolve("@esbuild-kit/core-utils"));
const typographyRequire = createRequire(require.resolve("@tailwindcss/typography"));

test("flat overrides resolve patched copies without downgrading Wrangler or tsx", () => {
  assert.equal(coreRequire("esbuild/package.json").version,
    manifest.overrides.esbuild);
  assert.equal(typographyRequire("postcss-selector-parser/package.json").version,
    manifest.overrides["postcss-selector-parser"]);
  assert.equal(coreRequire("esbuild/package.json").version, "0.28.2");
  for (const parent of ["drizzle-kit", "wrangler", "tsx"]) {
    const parentRequire = createRequire(path.join(root, `node_modules/${parent}/package.json`));
    assert.equal(parentRequire("esbuild/package.json").version, "0.28.2", parent);
  }
  assert.equal(typographyRequire("postcss-selector-parser/package.json").version, "7.1.6");
});

// Resolve through the consumer (including legacy minimatch) so hoisted safe
// copies cannot mask a stale vulnerable nested install. Avoid package.json
// exports assumptions: sharp intentionally does not export its manifest.
function dependencyManifest(consumerRequire, name) {
  const entry = consumerRequire.resolve(name);
  for (let directory = path.dirname(entry); ; directory = path.dirname(directory)) {
    const file = path.join(directory, "package.json");
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      if (pkg.name === name) return { pkg, entry };
    }
    assert.notEqual(path.dirname(directory), directory, `Missing manifest for ${name}`);
  }
}

function consumerRequire(name, parent = require) {
  return createRequire(dependencyManifest(parent, name).entry);
}

function assertPatchedVersion(actual, minimum, family) {
  const parts = (version) => version.split(".").map(Number);
  const actualParts = parts(actual);
  const minimumParts = parts(minimum);
  assert.equal(actualParts.length, 3, `${family}: unexpected version ${actual}`);
  assert.ok(actualParts.every(Number.isInteger), `${family}: unexpected version ${actual}`);
  const firstDifference = actualParts.findIndex((part, i) => part !== minimumParts[i]);
  assert.ok(firstDifference < 0 || actualParts[firstDifference] > minimumParts[firstDifference],
    `${family}: ${actual} must be >= ${minimum}`);
}

test("all nine security families resolve patched copies through their consumers", () => {
  const minimatchRequire = consumerRequire("minimatch");
  const legacyMinimatchRequire = consumerRequire("minimatch", consumerRequire("eslint-plugin-jsx-a11y"));
  const modernBrace = dependencyManifest(minimatchRequire, "brace-expansion").pkg.version;
  const legacyBrace = dependencyManifest(legacyMinimatchRequire, "brace-expansion").pkg.version;
  assert.equal(modernBrace.split(".")[0], "5", "Do not override the modern brace API with 1.x");
  assert.equal(legacyBrace.split(".")[0], "1", "Do not override legacy minimatch with brace 5.x");
  assertPatchedVersion(modernBrace, "5.0.12", "brace-expansion modern");
  assertPatchedVersion(legacyBrace, "1.1.21", "brace-expansion legacy");

  const copies = [
    [coreRequire, "esbuild", "0.25.0"],
    [createRequire(path.join(root, "node_modules/@tanstack/devtools-bundler-core/package.json")),
      "launch-editor", "2.14.2"],
    [typographyRequire, "postcss-selector-parser", "7.1.6"],
    [consumerRequire("solid-js"), "seroval", "1.6.11"],
    [consumerRequire("miniflare"), "sharp", "0.35.5"],
    [consumerRequire("launch-editor"), "shell-quote", "1.11.0"],
    [createRequire(path.join(root, "node_modules/knip/package.json")), "smol-toml", "1.9.0"],
    [consumerRequire("@tailwindcss/node"), "source-map-js", "1.2.2"],
  ];
  for (const [consumer, dependency, minimum] of copies) {
    assertPatchedVersion(dependencyManifest(consumer, dependency).pkg.version, minimum, dependency);
  }
});

test("Zod rejects oversized collections before processing attacker-controlled elements", () => {
  const { z } = require("zod");
  let visits = 0;
  const element = z.preprocess((value) => { visits++; return value; }, z.string());
  for (const [schema, input] of [
    [z.array(element).max(2), [1, 2, 3]],
    [z.set(element).max(2), new Set([1, 2, 3])],
    [z.map(element, element).max(2), new Map([[1, 1], [2, 2], [3, 3]])],
  ]) {
    const result = schema.safeParse(input);
    assert.equal(result.success, false);
    assert.deepEqual(result.error.issues.map((issue) => issue.code), ["too_big"]);
    assert.equal(visits, 0);
  }
  assert.deepEqual(z.array(element).max(2).parse(["one", "two"]), ["one", "two"]);
  assert.equal(visits, 2);
});

test("typography preserves trailing pseudo-element handling with parser 7", () => {
  const { commonTrailingPseudos } = typographyRequire("./utils.js");
  const cases = [
    ["p", [null, "p"]],
    ["p::before", ["::before", "p"]],
    ["p::before,a::before", ["::before", "p,a"]],
    ["p::before,a::after", [null, "p::before,a::after"]],
    ["p::before::marker,a::before::marker", ["::before::marker", "p,a"]],
    ["p::before::marker,a::after::marker", ["::marker", "p::before,a::after"]],
    [":is(h1,h2,h3)::after", ["::after", ":is(h1,h2,h3)"]],
    ["[data-name=\"a,b\"]::before,[data-name=\"x\"]::before",
      ["::before", "[data-name=\"a,b\"],[data-name=\"x\"]"]],
    ["ul > li::marker,ol > li::marker", ["::marker", "ul > li,ol > li"]],
    [".prose\\:content > p::after", ["::after", ".prose\\:content > p"]],
  ];
  for (const [selector, expected] of cases) {
    assert.deepEqual(commonTrailingPseudos(selector), expected, selector);
  }
});

test("all typography components and variants match the pre-update output", () => {
  // Baseline @tailwindcss/typography 0.5.20 + postcss-selector-parser 6.0.10.
  // Snapshot covers every built-in size/color modifier, not one happy path.
  const snapshots = [
    [{}, "f713d2d55229bbea7f2a6ef6e3c755010e0a44a49e3ad084870447e2d215bb44"],
    [{ target: "legacy" }, "c51aa5d6c2f9efa260a01dec5dce636e0e34cd880f25b3b6905b32a3dbf991fe"],
    [{ className: "review-prose" }, "44a9f72a4c91d35fc6aeb1d9fd5bb594f3d1ac6209ee54b8fbcb86987ec029c7"],
  ];
  for (const [options, expected] of snapshots) {
    const plugin = require("@tailwindcss/typography")(options);
    const components = [];
    const variants = [];
    plugin.handler({
      addComponents(value) { components.push(value); },
      addVariant(name, selector) { variants.push([name, selector]); },
      theme(name) {
        assert.equal(name, "typography");
        return plugin.config.theme.typography;
      },
      prefix(value) { return value; },
    });
    const actual = createHash("sha256").update(JSON.stringify({ components, variants })).digest("hex");
    assert.equal(actual, expected, JSON.stringify(options));
  }
});

test("core-utils keeps TypeScript sync/async transform semantics and source maps", async () => {
  const core = require("@esbuild-kit/core-utils");
  const cases = [
    ["typed-object", "const q: { count: number } = { count: 2 }; module.exports = q.count + 40;", 42],
    ["enum", "enum Status { Draft = 2, Approved = 7 }; module.exports = Status.Approved;", 7],
    ["class-field", "class Order { total: number = 42 }; module.exports = new Order().total;", 42],
    ["optional-chain", "const q: { nested?: { id: number } } = {}; module.exports = q.nested?.id ?? 42;", 42],
  ];
  for (const [name, source, expected] of cases) {
    const file = path.join(root, `dependency-review-${name}.ts`);
    const sync = core.transformSync(source, file);
    const module = { exports: {} };
    vm.runInNewContext(sync.code, { module, exports: module.exports }, { timeout: 1000 });
    assert.equal(module.exports, expected);
    const asyncResult = await core.transform(source, file);
    const loaded = await import(`data:text/javascript;base64,${Buffer.from(asyncResult.code).toString("base64")}`);
    assert.equal(loaded.default, expected);
    for (const result of [sync, asyncResult]) {
      assert.equal(result.map.version, 3);
      assert.ok(result.map.sources.includes(file));
      assert.ok(result.map.sourcesContent.includes(source));
      assert.deepEqual(result.warnings ?? [], []);
    }
  }
});

test("the overridden esbuild server does not permit an untrusted web origin", { timeout: 10000 }, async () => {
  const esbuild = coreRequire("esbuild");
  const context = await esbuild.context({
    stdin: { contents: "console.log('dependency-review')", sourcefile: "review.js" },
    outfile: "dependency-review.js",
    write: false,
  });
  try {
    // Deliberately loopback-only. This does not start the app or contact a DB.
    const server = await context.serve({ host: "127.0.0.1", port: 0 });
    const response = await fetch(`http://127.0.0.1:${server.port}/dependency-review.js`, {
      headers: { Origin: "https://untrusted.invalid" },
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, "Exercise the actual generated asset, not a missing path");
    assert.match(await response.text(), /dependency-review/);
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "https://untrusted.invalid");
  } finally {
    await context.dispose();
  }
});

test("Drizzle loads typed config and schema, generates and checks migrations entirely offline", { timeout: 30000 }, () => {
  // This exercises Drizzle's additional esbuild consumer after the Bun 1.3.3
  // compatibility override. Never use a real config, credentials or database.
  const cache = path.join(root, "node_modules/.cache");
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(path.join(cache, "dependency-drizzle-"));
  const output = path.join(directory, "generated");
  const config = path.join(directory, "drizzle.config.ts");
  try {
    writeFileSync(config, `import { defineConfig } from "drizzle-kit";\nconst paths: { schema: string; out: string } = ${JSON.stringify({ schema: './schema.ts', out: './generated' })};\nexport default defineConfig({ dialect: "postgresql", ...paths });\n`);
    writeFileSync(path.join(directory, "columns.ts"), 'import { integer } from "drizzle-orm/pg-core";\nexport const countColumn = (name: string) => integer(name).notNull().default(0);\n');
    writeFileSync(path.join(directory, "schema.ts"), 'import { pgTable, uuid, text } from "drizzle-orm/pg-core";\nimport { countColumn } from "./columns";\nexport const dependencyFixture = pgTable("dependency_fixture", { id: uuid("id").primaryKey(), label: text("label").notNull(), count: countColumn("count") });\n');
    const run = (command) => {
      const result = spawnSync(process.execPath, [path.join(root, "node_modules/drizzle-kit/bin.cjs"), command, `--config=${config}`], {
        cwd: directory,
        // Do not inherit production/database credentials or preload options.
        env: { PATH: process.env.PATH, HOME: directory, NO_COLOR: "1" },
        encoding: "utf8", timeout: 15000,
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    run("generate");
    const files = readdirSync(output).filter((file) => file.endsWith(".sql"));
    assert.equal(files.length, 1);
    assert.equal(readFileSync(path.join(output, files[0]), "utf8"), 'CREATE TABLE "dependency_fixture" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"label" text NOT NULL,\n\t"count" integer DEFAULT 0 NOT NULL\n);\n');
    assert.match(run("check"), /Everything's fine/);
    assert.match(run("generate"), /No schema changes/);
    assert.equal(readdirSync(output).filter((file) => file.endsWith(".sql")).length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy-compatible lock retains registry integrity and has no Git or tarball aliases", () => {
  // Format v1 is needed by the observed Bun 1.3.3 installer. Preserve stronger
  // integrity invariants explicitly; this is not a general v2/v1 converter.
  const parsed = require("typescript").parseConfigFileTextToJson("bun.lock", readFileSync(path.join(root, "bun.lock"), "utf8"));
  assert.equal(parsed.error, undefined);
  const lock = parsed.config;
  assert.equal(lock.lockfileVersion, 1);
  assert.deepEqual(lock.overrides, manifest.overrides);
  assert.ok(Object.values(lock.overrides).every((value) => typeof value === "string"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    assert.equal(entry.length, 4, name);
    assert.match(entry[0], /^(@[^/]+\/)?[^@]+@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, name);
    assert.match(entry[3], /^sha512-[A-Za-z0-9+/]+={0,2}$/, name);
    assert.equal(Buffer.from(entry[3].slice(7), "base64").length, 64, name);
    if (entry[1]) {
      const source = new URL(entry[1]);
      assert.equal(source.protocol, "https:", name);
      for (const component of ["username", "password", "port", "search", "hash"]) {
        assert.equal(source[component], "", name);
      }
      const official = source.hostname === "registry.npmjs.org";
      const existingMirror = ["europe-west1-npm.pkg.dev", "europe-west4-npm.pkg.dev"].includes(source.hostname)
        && source.pathname.startsWith("/lovable-core-prod/sandbox-npm-cache/");
      assert.ok(official || existingMirror, name);
    }
  }
});

test("TanStack production consumers resolve patched Seroval while Solid keeps its supported family", () => {
  const { satisfies } = require("semver");
  const consumers = [
    "@tanstack/router-core", "@tanstack/start-client-core",
    "@tanstack/start-server-core", "@tanstack/start-plugin-core",
  ];
  for (const parent of consumers) {
    // Start cores export their entry only under the ESM import condition.
    // Resolve that real entry, then resolve dependencies from its location.
    const parentEntry = fileURLToPath(import.meta.resolve(parent));
    const parentRequire = createRequire(parentEntry);
    const parentManifest = JSON.parse(readFileSync(path.join(root, "node_modules", parent, "package.json"), "utf8"));
    const installed = dependencyManifest(parentRequire, "seroval").pkg.version;
    assertPatchedVersion(installed, "1.7.2", `${parent}/seroval`);
    assert.ok(satisfies(installed, parentManifest.dependencies.seroval),
      `${parent}: retain the declared Seroval contract`);
    if (parentManifest.dependencies["seroval-plugins"]) {
      const plugins = dependencyManifest(parentRequire, "seroval-plugins").pkg;
      assertPatchedVersion(plugins.version, "1.7.2", `${parent}/seroval-plugins`);
      assert.ok(satisfies(plugins.version, parentManifest.dependencies["seroval-plugins"]),
        `${parent}: retain the declared plugin contract`);
      assert.ok(satisfies(installed, plugins.peerDependencies.seroval));
    }
  }
  const solid = dependencyManifest(require, "solid-js");
  const solidRequire = consumerRequire("solid-js");
  const solidSeroval = dependencyManifest(solidRequire, "seroval").pkg.version;
  const solidPlugins = dependencyManifest(solidRequire, "seroval-plugins").pkg.version;
  assert.ok(satisfies(solidSeroval, solid.pkg.dependencies.seroval));
  assert.ok(satisfies(solidPlugins, solid.pkg.dependencies["seroval-plugins"]));
  assert.ok(satisfies(solidSeroval, "~1.6.8"), "Do not override Solid with Seroval 1.7");
  assertPatchedVersion(solidSeroval, "1.6.11", "Solid devtools/seroval");
  assertPatchedVersion(solidPlugins, "1.6.12", "Solid devtools/seroval-plugins");
  assert.notEqual(dependencyManifest(solidRequire, "seroval").entry,
    dependencyManifest(consumerRequire("@tanstack/router-core"), "seroval").entry);
});

test("TanStack's production Seroval preserves trusted values and shared references", () => {
  const { toJSON, fromJSON } = consumerRequire("@tanstack/router-core")("seroval");
  const shared = { amount: 42n };
  const source = {
    first: shared, second: shared,
    date: new Date("2026-10-28T00:00:00.000Z"),
    pattern: /^invoice-\d+$/iu,
    map: new Map([["line", shared]]),
    set: new Set(["MXN", "USD"]),
  };
  const result = fromJSON(toJSON(source));
  assert.deepEqual(result, source);
  assert.equal(result.first, result.second);
  assert.equal(result.map.get("line"), result.first);
  assert.equal(result.pattern.test("INVOICE-42"), true);
});

test("production Seroval cannot crash Node with an ignored rejected promise", { timeout: 10000 }, () => {
  // GHSA-3pfx-gxff-vg76 / upstream commit 737afa1. An isolated process with
  // strict rejection handling proves the fix without masking errors through a
  // global rejection handler. No network, credentials or application DB is used.
  const entry = dependencyManifest(consumerRequire("@tanstack/router-core"), "seroval").entry;
  const script = `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    import { setTimeout as settle } from "node:timers/promises";
    const load = createRequire(${JSON.stringify(entry)});
    const api = load(${JSON.stringify(entry)});
    for (const [encode, decode] of [
      [api.toJSONAsync, api.fromJSON], [api.toCrossJSONAsync, api.fromCrossJSON]
    ]) {
      const ignored = await encode({ unused: Promise.reject(new Error("unused rejection")) }, { refs: new Map() });
      decode(ignored, { refs: new Map() });
      await settle(25);
      const observed = await encode({ awaited: Promise.reject(new Error("observed rejection")) }, { refs: new Map() });
      const decoded = decode(observed, { refs: new Map() });
      await assert.rejects(decoded.awaited, /observed rejection/);
    }
    await settle(25);
    process.stdout.write("survived-seroval-rejections\\n");
  `;
  const result = spawnSync(process.execPath,
    ["--unhandled-rejections=strict", "--input-type=module", "-e", script], {
      encoding: "utf8", timeout: 7000, windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
    });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /survived-seroval-rejections/);
});
