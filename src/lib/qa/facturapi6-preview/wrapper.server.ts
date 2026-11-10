import type { Caller, ReadDb } from "./core.server";
import { windowOpen, type PreviewWindow, type PreflightResult } from "./policy";

/** Injected edges of the real server-function wrapper (testable offline). */
export interface WrapperDeps {
  window: Readonly<PreviewWindow>;
  development: boolean;
  now(): number;
  headers: { get(name: string): string | null };
  env: { url?: string; publishableKey?: string };
  createCaller(url: string, key: string, authorization: string): Promise<Caller>;
  loadSecretReader(): Promise<ReadDb>;
  readIssuer(key: string, signal: AbortSignal): Promise<unknown>;
}

const fail = (status: number, code: PreflightResult["code"]): PreflightResult => ({ ok: false, status, code });

export async function handlePreviewPreflight(deps: WrapperDeps): Promise<PreflightResult> {
  // Shutdown, DEV and window are checked before any client is created.
  if (!deps.window.enabled || deps.window.shutdown) return fail(423, "disabled");
  if (!deps.development) return fail(403, "preview_only");
  if (!windowOpen(deps.window, deps.now())) return fail(410, "expired");
  try {
    const header = deps.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return fail(401, "unauthorized");
    const { url, publishableKey } = deps.env;
    if (!url || !publishableKey) return fail(503, "unavailable");
    const origin = deps.headers.get("origin") ?? "";
    const { runReadOnlyPreflight } = await import("./core.server");
    const caller = await deps.createCaller(url, publishableKey, header);
    return await runReadOnlyPreflight({
      now: deps.now, window: deps.window, development: deps.development, origin, token, caller,
      loadSecretReader: deps.loadSecretReader, readIssuer: deps.readIssuer,
      // verifyKeyExclusive intentionally absent: no reviewed DB mechanism yet.
    });
  } catch { return fail(503, "unavailable"); }
}
