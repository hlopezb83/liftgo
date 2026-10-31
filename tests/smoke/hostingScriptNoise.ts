import { PUBLISHED_APP_ORIGIN, type SmokeRequest } from "./readOnlyPolicy";

// Hosting-injected analytics, not build assets. Keep these exact identities:
// a new hash or path must fail the smoke until it has been reviewed separately.
const HOSTING_SCRIPT_URLS = new Set([
  `${PUBLISHED_APP_ORIGIN}/~flock.js`,
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.js`,
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js`,
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.b21a279f52bb8621.js`,
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.59f10ad6d72ea62d.js`,
  // Verified 2026-10-31: served from the published origin, byte-identical to 59f10ad6d72ea62d
  // (29,187 bytes, SHA256 9005204863a3d003ce0c18bbbe50df0f4d246587e4d19a0d18de980479c61238).
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.270c78a44fc53e7b.js`,
]);

/** Exact URLs only; fragments never travel to the server. No other rewriting. */
export function knownHostingScriptUrl(url: string, origin: string): string | undefined {
  if (origin !== PUBLISHED_APP_ORIGIN) return undefined;
  const withoutFragment = url.split("#", 1)[0];
  return HOSTING_SCRIPT_URLS.has(withoutFragment) ? withoutFragment : undefined;
}

/** Classifies an expected abort; it never grants network permission. */
export function expectedHostingScriptAbort(request: SmokeRequest, origin: string): string | undefined {
  if (request.method !== "GET" || request.resourceType !== "script") return undefined;
  return knownHostingScriptUrl(request.url, origin);
}
