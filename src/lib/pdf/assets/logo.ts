/** Optional, public global brand asset. Never use an organization-controlled URL. */
import { GLOBAL_BRAND_LOCKUP_PATH } from "@/lib/branding/globalBrandLogo";

export const BRAND_LOGO_TIMEOUT_MS = 3_000;
let cached: string | null = null;
let cacheGeneration = 0;

function readBlob(blob: Blob, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reader.onloadend = null; reader.onerror = null;
      resolve(value);
    };
    const abort = () => {
      try { reader.abort(); } catch { /* Optional asset: failure still resolves to no logo. */ }
      finish(null);
    };
    reader.onloadend = () => finish(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => finish(null);
    if (signal.aborted) { finish(null); return; }
    signal.addEventListener("abort", abort, { once: true });
    try { reader.readAsDataURL(blob); } catch { finish(null); }
  });
}

/** Each attempt owns its deadline: a pending/failed attempt never poisons retries. */
export async function loadGlobalBrandLogo(signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  if (cached) return cached;
  const generation = cacheGeneration;
  const controller = new AbortController();
  let finish: (value: null) => void = () => undefined;
  const cancelled = new Promise<null>((resolve) => { finish = resolve; });
  const abort = () => { controller.abort(); finish(null); };
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, BRAND_LOGO_TIMEOUT_MS);
  try {
    const load = async () => {
      const response = await fetch(GLOBAL_BRAND_LOCKUP_PATH, {
        credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok || controller.signal.aborted) return null;
      const blob = await response.blob();
      if (controller.signal.aborted) return null;
      return readBlob(blob, controller.signal);
    };
    const result = await Promise.race([load().catch(() => null), cancelled]);
    if (result && !controller.signal.aborted && generation === cacheGeneration) cached = result;
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Only for tests: stale attempts must not repopulate the cache. */
export function resetGlobalBrandLogoCache(): void {
  cacheGeneration += 1;
  cached = null;
}
