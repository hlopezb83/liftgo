import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  type DownloadCfdiDeps,
  type DownloadSupabaseLike,
  handleDownloadCfdi,
} from "./handler.ts";

function handle(req: Request): Promise<Response> {
  return handleDownloadCfdi(
    req,
    {
      createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
      createServiceClient: () =>
        getAdminClient() as unknown as DownloadSupabaseLike,
      fetchImpl: fetch,
      env: (k) => Deno.env.get(k),
    } satisfies DownloadCfdiDeps,
  );
}

Deno.serve(wrapEdgeFunction("download-cfdi", handle));
