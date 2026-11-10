import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { PREVIEW_WINDOW, type PreflightResult } from "./policy";

/** No loader calls this. Browser uses existing authAttacher; no mint/fallback. */
export const previewIssuerPreflight = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (input !== null) throw new Error("invalid_input");
    return null;
  })
  .handler(async (): Promise<PreflightResult> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!PREVIEW_WINDOW.enabled || PREVIEW_WINDOW.shutdown) return { ok: false, status: 423, code: "disabled" };
    try {
      const request = getRequest();
      const header = request.headers.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) return { ok: false, status: 401, code: "unauthorized" };
      const url = process.env['SUPABASE_URL'];
      const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
      if (!url || !key) return { ok: false, status: 503, code: "unavailable" };
      const { createClient } = await import("@supabase/supabase-js");
      const caller = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: header }, fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        } },
      });
      const { runReadOnlyPreflight } = await import("./core.server");
      const { readSdk6Issuer } = await import("./sdk.server");
      return await runReadOnlyPreflight({
        now: Date.now, window: PREVIEW_WINDOW, development: import.meta.env.DEV,
        origin: request.headers.get("origin") ?? "", token,
        caller: caller as unknown as import("./core.server").Caller,
        loadSecretReader: async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin as unknown as import("./core.server").ReadDb;
        },
        readIssuer: readSdk6Issuer,
      });
    } catch { return { ok: false, status: 503, code: "unavailable" }; }
  });
