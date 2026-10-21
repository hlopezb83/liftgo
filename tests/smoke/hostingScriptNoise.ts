import { PUBLISHED_APP_ORIGIN, type SmokeRequest } from "./readOnlyPolicy";

// Hosting-injected analytics, not build assets. Keep these exact identities:
// a new hash or path must fail the smoke until it has been reviewed separately.
const HOSTING_SCRIPT_URLS = new Set([
  `${PUBLISHED_APP_ORIGIN}/~flock.js`,
  `${PUBLISHED_APP_ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js`,
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
