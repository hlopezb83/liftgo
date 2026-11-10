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
      const { handlePreviewPreflight } = await import("./wrapper.server");
      return await handlePreviewPreflight({
        window: PREVIEW_WINDOW, development: import.meta.env.DEV, now: Date.now,
        headers: getRequest().headers,
        env: { url: process.env['SUPABASE_URL'], publishableKey: process.env['SUPABASE_PUBLISHABLE_KEY'] },
        createCaller: async (url, key, authorization) => {
          const { createClient } = await import("@supabase/supabase-js");
          const client = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: authorization }, fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            } },
          });
          return client as unknown as import("./core.server").Caller;
        },
        loadSecretReader: async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin as unknown as import("./core.server").ReadDb;
        },
        verifyKeyExclusive: async () => {
          const { verifyElogistixTestKeyExclusive } = await import("./exclusivity.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return verifyElogistixTestKeyExclusive(supabaseAdmin as unknown as import("./exclusivity.server").ExclusivityRpc);
        },
        readIssuer: async (key, signal) => (await import("./sdk.server")).readSdk6Issuer(key, signal),
      });
    } catch { return { ok: false, status: 503, code: "unavailable" }; }
  });
