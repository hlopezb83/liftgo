import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  FAKE_BACKEND,
  assertBuildUsesFakeBackend,
  assertEffectiveBindings,
  assertLocalBaseURL,
  browserLaunchOptions,
} from "../browser-test-config.mjs";

test("base URL accepts literal IPv4 and IPv6 loopback origins", () => {
  for (const value of ["http://127.0.0.1:4173", "http://127.0.0.1:4173/", "http://[::1]:4173"]) {
    assert.equal(assertLocalBaseURL(value).protocol, "http:");
  }
});

test("base URL rejects aliases, wildcard listeners, nonlocal destinations and extra URL parts", () => {
  for (const value of [
    "https://127.0.0.1:4173", "http://localhost:4173", "http://0.0.0.0:4173",
    "http://127.0.0.2:4173", "http://[::]:4173", "http://[::ffff:127.0.0.1]:4173",
    "http://127.1:4173", "http://2130706433:4173", "http://127.0.0.1", "http://127.0.0.1:80",
    "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://user@127.0.0.1:4173",
    "http://127.0.0.1:4173/path", "http://127.0.0.1:4173/../", "http://127.0.0.1:4173?x=1",
    "http://127.0.0.1:4173#x", " http://127.0.0.1:4173", "http://synthetic.invalid:4173", "bad", null,
  ]) assert.throws(() => assertLocalBaseURL(value), /browser isolation/, String(value));
});

test("browser launch policy covers new contexts and disables nonproxy transports", () => {
  const options = browserLaunchOptions("http://127.0.0.1:4174");
  assert.deepEqual(options.proxy, { server: "http://127.0.0.1:4174", bypass: "<-loopback>" });
  assert.deepEqual(options.args, ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]);
  assert.equal(Object.hasOwn(options, "executablePath"), false);
  assert.equal(browserLaunchOptions("http://127.0.0.1:4174", "synthetic-chromium").executablePath, "synthetic-chromium");
  assert.throws(() => browserLaunchOptions("http://synthetic.invalid:4174"), /loopback/);
});

test("effective bindings require exactly seven explicit synthetic values, with optional assets", () => {
  assert.equal(Object.keys(FAKE_BACKEND).length, 7);
  assert(Object.isFrozen(FAKE_BACKEND));
  assert.doesNotThrow(() => assertEffectiveBindings({ ...FAKE_BACKEND }));
  assert.doesNotThrow(() => assertEffectiveBindings({ ...FAKE_BACKEND, ASSETS: {} }));
  for (const name of Object.keys(FAKE_BACKEND)) {
    const missing = { ...FAKE_BACKEND };
    delete missing[name];
    assert.throws(() => assertEffectiveBindings(missing), /Effective binding differs/);
    assert.throws(() => assertEffectiveBindings({ ...FAKE_BACKEND, [name]: "synthetic-wrong" }), /Effective binding differs/);
  }
  assert.throws(() => assertEffectiveBindings(Object.create(FAKE_BACKEND)), /Effective binding differs/);
  assert.throws(() => assertEffectiveBindings({ ...FAKE_BACKEND, EXTRA_SECRET: "synthetic" }), /Unexpected effective binding/);
  assert.throws(() => assertEffectiveBindings(null), /Missing effective/);
});

function withBuild(callback) {
  const root = mkdtempSync(join(tmpdir(), "liftgo-browser-config-"));
  mkdirSync(join(root, "dist", "client", "assets"), { recursive: true });
  const asset = join(root, "dist", "client", "assets", "app.js");
  writeFileSync(asset, JSON.stringify(FAKE_BACKEND));
  try { callback(root, asset); }
  finally {
    // Delete only the unique directory this test created under the OS temp
    // directory; never clean up a caller-provided or parent path.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith("liftgo-browser-config-"));
    rmSync(root, { recursive: true });
  }
}

test("build validation accepts synthetic client markers and ignores root dotenv", () => {
  withBuild((root) => {
    writeFileSync(join(root, ".env"), "DO_NOT_READ=https://synthetic-ref.supabase.co");
    assert.doesNotThrow(() => assertBuildUsesFakeBackend(root, ["forbidden-synthetic-ref"]));
  });
});

test("build validation rejects missing markers and absent output", () => {
  withBuild((root, asset) => {
    for (const marker of ["http://127.0.0.1:54321", "smoke-placeholder-key"]) {
      writeFileSync(asset, JSON.stringify(FAKE_BACKEND).replaceAll(marker, ""));
      assert.throws(() => assertBuildUsesFakeBackend(root), /lacks the complete/);
    }
    assert.throws(() => assertBuildUsesFakeBackend(join(root, "missing")), /Missing or unsafe/);
    writeFileSync(asset, JSON.stringify({
      url: FAKE_BACKEND.VITE_SUPABASE_URL,
      key: FAKE_BACKEND.VITE_SUPABASE_PUBLISHABLE_KEY,
    }));
    assert.doesNotThrow(() => assertBuildUsesFakeBackend(root));
    writeFileSync(asset, JSON.stringify({
      url: `${FAKE_BACKEND.VITE_SUPABASE_URL}/not-the-origin`,
      key: `${FAKE_BACKEND.VITE_SUPABASE_PUBLISHABLE_KEY}-suffix`,
    }));
    assert.throws(() => assertBuildUsesFakeBackend(root), /lacks the complete/);
  });
});

test("build validation blocks forbidden refs and hosted Supabase HTTP or WebSocket URLs", () => {
  withBuild((root, asset) => {
    for (const url of [
      "https://synthetic-ref.supabase.co", "wss://synthetic-ref.supabase.co/realtime/v1",
      "http://synthetic-ref.supabase.in", "https:\\/\\/synthetic-ref.supabase.co",
    ]) {
      writeFileSync(asset, `${JSON.stringify(FAKE_BACKEND)}\n${url}`);
      assert.throws(() => assertBuildUsesFakeBackend(root), /hosted Supabase URL/);
    }
    writeFileSync(asset, `${JSON.stringify(FAKE_BACKEND)}\nforbidden-SYNTHETIC-ref`);
    assert.throws(() => assertBuildUsesFakeBackend(root, ["forbidden-synthetic-ref"]), /forbidden project reference/);
  });
});
