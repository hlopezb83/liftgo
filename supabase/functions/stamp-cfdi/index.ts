import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { handleStampCfdi, type SupabaseLike } from "./handler.ts";
import { createInvoiceGateway } from "./invoiceGateway.ts";

function handle(req: Request): Promise<Response> {
  return handleStampCfdi(req, {
    createCallerClient: () => getCallerClient(req) as unknown as SupabaseLike,
    createServiceClient: () => getAdminClient() as unknown as SupabaseLike,
    createInvoiceGateway,
    env: (k) => Deno.env.get(k),
  });
}

Deno.serve(wrapEdgeFunction("stamp-cfdi", handle));
