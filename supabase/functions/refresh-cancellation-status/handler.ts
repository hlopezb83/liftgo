// Pure handler for refresh-cancellation-status, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
  retrieveInvoiceWithSignal,
  updateInvoiceStatusWithSignal,
} from "../_shared/facturapi/client.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_SAT_STATUSES = [
  "accepted",
  "pending",
  "rejected",
  "expired",
];
const TERMINAL_STATUSES = new Set(["accepted", "rejected", "expired"]);

export interface RefreshCancellationDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (key: string) => string | undefined;
}

export async function handleRefreshCancellation(
  req: Request,
  deps: RefreshCancellationDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number) =>
    jsonResponse(req, body, { status });

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[refresh-cancellation-status]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const supabase = auth.supabase;

    const { invoice_id } = (await req.json().catch(() => ({}))) as {
      invoice_id?: unknown;
    };
    if (!isUUID(invoice_id)) {
      return json({ error: "invoice_id must be a valid UUID" }, 400);
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select("facturapi_invoice_id, cancellation_status")
      .eq("id", invoice_id as string)
      .single();
    const inv = invoice as Record<string, unknown> | null;
    if (!inv?.facturapi_invoice_id) {
      return json({ error: "Invoice has no Facturapi reference" }, 404);
    }

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) return json({ error: "Facturapi key not configured" }, 400);

    const fid = inv.facturapi_invoice_id as string;
    const client = createFacturapiClient(apiKey);
    let facturApiInv: Record<string, unknown> = {};
    try {
      // ARQ2-A1: ambas llamadas al PAC con timeout (SDK sin signal → race).
      try {
        const updated = await sdkCallWithTimeout((signal) =>
          updateInvoiceStatusWithSignal(client, fid, { signal })
        );
        if (updated && typeof updated === "object") {
          facturApiInv = updated as Record<string, unknown>;
        }
      } catch (e) {
        // Si updateStatus falla (404 SAT, timeout, etc.) seguimos con retrieve.
        if (isFacturapiTimeout(e)) {
          console.warn("[refresh-cancellation-status] updateStatus timeout", {
            fid,
          });
        }
      }
      if (!facturApiInv.cancellation_status) {
        facturApiInv = await sdkCallWithTimeout((signal) =>
          retrieveInvoiceWithSignal(client, fid, { signal })
        ) as Record<string, unknown>;
      }
    } catch (err) {
      // ARQ2-A1: timeout → conservar cancellation_status actual, responder 504 transient.
      if (isFacturapiTimeout(err)) {
        console.warn("[refresh-cancellation-status] facturapi timeout", {
          fid,
        });
        return json({
          error: "PAC no respondió a tiempo, reintenta",
          code: "TIMEOUT",
          transient: true,
        }, 504);
      }
      const desc = describeFacturapiError(err);
      return json(
        {
          error: `Facturapi status error: ${desc.status}`,
          detail: desc.detail,
        },
        502,
      );
    }
    const rawCancel =
      (facturApiInv?.cancellation_status as string | undefined) ??
        ((facturApiInv?.cancellation as Record<string, unknown> | undefined)
          ?.status as string | undefined);
    const rootStatus = facturApiInv?.status as string | undefined;
    const prior = (inv.cancellation_status as string | undefined) ?? "none";
    // Facturapi marca la cancelación aceptada bajando el `status` raíz a
    // "canceled" (a veces "cancelled") y no siempre poblando cancellation_status.
    let satStatus = prior;
    if (
      rootStatus === "canceled" || rootStatus === "cancelled" ||
      rawCancel === "accepted"
    ) {
      satStatus = "accepted";
    } else if (rawCancel && VALID_SAT_STATUSES.includes(rawCancel)) {
      // Nunca degradar un estado terminal a pending.
      if (!(TERMINAL_STATUSES.has(prior) && rawCancel === "pending")) {
        satStatus = rawCancel;
      }
    } else if (prior === "none") {
      satStatus = "pending";
    }

    const update: Record<string, unknown> = { cancellation_status: satStatus };
    if (satStatus === "accepted") {
      update.cfdi_status = "cancelled";
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }
    await supabase.from("invoices").update(update).eq(
      "id",
      invoice_id as string,
    );

    return json({ success: true, cancellation_status: satStatus }, 200);
  } catch (_err) {
    return jsonError(req, 500, "Internal server error");
  }
}
