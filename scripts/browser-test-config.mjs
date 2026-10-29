import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Synthetic values used by the build and by the effective Worker bindings. */
export const FAKE_BACKEND = Object.freeze({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder-key",
  SUPABASE_SERVICE_ROLE_KEY: "smoke-placeholder-service-role-key",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder-key",
  VITE_SUPABASE_PROJECT_ID: "smoke-placeholder",
  SENTRY_DSN: "http://public@127.0.0.1:54322/1",
});

/** Accept literal loopback origins only; never rely on DNS for this guard. */
export function assertLocalBaseURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("[browser isolation] Invalid local base URL");
  }
  // Checking the original authority also rejects normalized aliases, omitted
  // ports, default port :80, whitespace and URL parser path normalization.
  if (typeof value !== "string"
    || !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}\/?$/.test(value)
    || url.protocol !== "http:"
    || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash
    || url.pathname !== "/"
    || !url.port) {
    throw new Error("[browser isolation] Base URL must be an explicit HTTP loopback origin and port");
  }
  return url;
}

/**
 * Launch-level proxy also applies to browser.newContext() inside recovery
 * tests. A context-only proxy setting would leave those contexts unguarded.
 */
export function browserLaunchOptions(proxyURL, executablePath) {
  assertLocalBaseURL(proxyURL);
  return {
    proxy: { server: proxyURL, bypass: "<-loopback>" },
    args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    ...(executablePath ? { executablePath } : {}),
  };
}

/** Validate the values actually handed to the Worker, not process.env. */
export function assertEffectiveBindings(bindings) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new Error("[browser isolation] Missing effective Worker bindings");
  }
  for (const [name, expected] of Object.entries(FAKE_BACKEND)) {
    if (!Object.hasOwn(bindings, name) || bindings[name] !== expected) {
      // Report the key only: an inherited value could contain a real secret.
      throw new Error(`[browser isolation] Effective binding differs: ${name}`);
    }
  }
  for (const name of Object.keys(bindings)) {
    if (!Object.hasOwn(FAKE_BACKEND, name) && name !== "ASSETS") {
      throw new Error(`[browser isolation] Unexpected effective binding: ${name}`);
    }
  }
  return bindings;
}

function* buildTextFiles(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error("[browser isolation] Build must not contain symlinks");
    if (stat.isDirectory()) yield* buildTextFiles(file);
    else if (stat.isFile() && /\.(?:js|mjs|cjs|html|json|txt|map)$/.test(name)) yield file;
  }
}

/**
 * Scan only generated browser assets; no dotenv or credential files are read.
 * This supplements runtime network denial; it is not a general URL proof.
 */
export function assertBuildUsesFakeBackend(root, productionRefs = []) {
  const markers = new Set([
    FAKE_BACKEND.VITE_SUPABASE_URL,
    FAKE_BACKEND.VITE_SUPABASE_PUBLISHABLE_KEY,
  ]);
  let files;
  try {
    files = [...buildTextFiles(join(root, "dist", "client"))];
  } catch (error) {
    throw new Error("[browser isolation] Missing or unsafe dist/client build", { cause: error });
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lowered = text.toLowerCase();
    if (productionRefs.some((ref) => lowered.includes(ref.toLowerCase()))) {
      throw new Error("[browser isolation] Build contains a forbidden project reference");
    }
    // Concrete Supabase hosted endpoints, including alternate custom project
    // refs, must never appear in a browser acceptance build.
    if (/(?:https?|wss?):(?:\/|\\\/){2}[^\s"'`<>\\]*\.supabase\.(?:co|in)\b/i.test(text)) {
      throw new Error("[browser isolation] Build contains a hosted Supabase URL");
    }
    for (const marker of markers) {
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match whole literals; prefixes or suffixes cannot impersonate a value.
      // Project ID is checked in runtime bindings: the browser does not use it.
      if (new RegExp(`["'\u0060]${escaped}["'\u0060]`).test(text)) markers.delete(marker);
    }
  }
  if (markers.size) throw new Error("[browser isolation] Build lacks the complete synthetic backend markers");
}
