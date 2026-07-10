// Pure handler for cancel-cfdi, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isNonEmptyString, isUUID } from "../_shared/validate.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);
const VALID_SAT_STATUSES = [
  "accepted",
  "pending",
  "rejected",
  "expired",
];

export interface CancelCfdiDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (key: string) => string | undefined;
}

export async function handleCancelCfdi(
  req: Request,
  deps: CancelCfdiDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number) =>
    jsonResponse(req, body, { status });
  const err = (status: number, message: string) =>
    jsonError(req, status, message);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    const supabase = deps.createServiceClient();
    const rolesRes = await supabase.from("user_roles").select("role").eq(
      "user_id",
      userId,
    );
    const roles = (rolesRes as { data: unknown }).data as
      | Array<{ role: string }>
      | null;
    const allowed = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const { invoice_id, motive, substitution_uuid, cancellation_reason } =
      (body ?? {}) as Record<string, unknown>;

    if (!isUUID(invoice_id)) {
      return json({ error: "invoice_id must be a valid UUID" }, 400);
    }
    if (typeof motive !== "string" || !VALID_MOTIVES.has(motive)) {
      return json({ error: "motive must be one of 01,02,03,04" }, 400);
    }
    if (motive === "01" && !isUUID(substitution_uuid)) {
      return json(
        {
          error:
            "substitution_uuid (UUID de factura sustituta) es requerido para motivo 01",
        },
        400,
      );
    }
    if (
      cancellation_reason &&
      !isNonEmptyString(cancellation_reason as string, 1000)
    ) {
      return json({ error: "cancellation_reason too long" }, 400);
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("cfdi_status, total, facturapi_invoice_id, is_e2e")
      .eq("id", invoice_id as string)
      .single();
    if (invErr || !invoice) return json({ error: "Invoice not found" }, 404);
    const inv = invoice as Record<string, unknown>;
    if (inv.is_e2e === true) {
      return json({ error: "E2E invoices cannot be cancelled at SAT" }, 403);
    }
    if (inv.cfdi_status !== "stamped") {
      return json({ error: "Only stamped invoices can be cancelled" }, 400);
    }

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    const facturApiId = inv.facturapi_invoice_id as string | null | undefined;

    let satStatus = "accepted";
    const isStub = !apiKey || !facturApiId;

    if (apiKey && facturApiId) {
      const client = createFacturapiClient(apiKey);
      const params: Record<string, string> = { motive };
      if (motive === "01" && substitution_uuid) {
        params.substitution = substitution_uuid as string;
      }
      try {
        const cancelJson = await client.invoices.cancel(
          facturApiId,
          params,
        );
        const rawStatus = ((cancelJson as { cancellation_status?: string })
          ?.cancellation_status) ?? "accepted";
        satStatus = VALID_SAT_STATUSES.includes(rawStatus)
          ? rawStatus
          : "pending";
      } catch (err) {
        const desc = describeFacturapiError(err);
        return json(
          {
            error: `Facturapi cancel error: ${desc.status}`,
            detail: desc.detail,
          },
          502,
        );
      }
    }

    const isAccepted = satStatus === "accepted";
    const update: Record<string, unknown> = {
      cancellation_status: satStatus,
      cancellation_motive: motive,
      substitution_uuid: motive === "01" ? substitution_uuid : null,
      cancellation_reason: cancellation_reason ?? null,
    };
    if (isAccepted) {
      update.cfdi_status = "cancelled";
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }
    const updRes = await supabase.from("invoices").update(update).eq(
      "id",
      invoice_id as string,
    );
    if ((updRes as { error: unknown }).error) {
      return json({ error: "Failed to update invoice" }, 500);
    }

    return json(
      {
        success: true,
        stub: isStub,
        cancellation_status: satStatus,
        accepted: isAccepted,
        warning: !isAccepted
          ? "El SAT marcó la cancelación como pendiente. El receptor tiene 72 horas para aceptar o rechazar."
          : undefined,
      },
      200,
    );
  } catch (_err) {
    return err(500, "Internal server error");
  }
}
