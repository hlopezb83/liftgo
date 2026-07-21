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
import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
} from "../_shared/cfdiRetryQueue.ts";

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
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const claims = claimsData.claims as Record<string, unknown>;
    // EC-A1: bypass de user-role para el consumidor interno de la cola de
    // reintentos (mismo patrón que stamp-cfdi/handler.ts). Solo el
    // service_role JWT del backend puede saltar la verificación de rol de
    // usuario; cualquier otro token cae al flujo normal. Sin este bypass el
    // consumer de cfdi_retry_queue recibiría 401 al reintentar cancelaciones.
    const isServiceRole = claims.role === "service_role";
    const userId = (claims.sub as string | undefined) ?? "";

    const supabase = deps.createServiceClient();
    if (!isServiceRole) {
      if (!userId) {
        return json({ error: "Unauthorized" }, 401);
      }
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
    }

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
      .select("cfdi_status, total, facturapi_invoice_id, is_e2e, customer_id")
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

    // BL-A4: no permitir cancelar si hay pagos aplicados. El admin debe
    // revertir/eliminar los pagos primero para evitar saldos huérfanos y
    // complementos REP colgando de una factura cancelada.
    if (typeof supabase.rpc === "function") {
      const cancellableRes = await supabase.rpc("assert_invoice_cancellable", {
        p_invoice_id: invoice_id as string,
      });
      const rpcData = (cancellableRes as { data: unknown }).data;
      const rpcErr = (cancellableRes as { error: unknown }).error;
      if (rpcErr) {
        return json(
          { error: "No se pudo validar cancelabilidad de la factura" },
          500,
        );
      }
      if (typeof rpcData === "string" && rpcData.length > 0) {
        return json({ error: rpcData }, 409);
      }
    }

    // BL-A4: para motivo 01 ("Comprobante emitido con errores con relación"),
    // el UUID sustituto debe corresponder a una factura timbrada vigente del
    // mismo cliente. Sin esta validación el SAT rechaza el trámite y la app
    // queda en un estado ambiguo.
    if (motive === "01" && substitution_uuid) {
      const subRes = await supabase
        .from("invoices")
        .select("id, cfdi_status, customer_id, cfdi_uuid")
        .eq("cfdi_uuid", substitution_uuid as string)
        .maybeSingle();
      const sub = (subRes as { data: unknown }).data as
        | { cfdi_status: string; customer_id: string | null; cfdi_uuid: string }
        | null;
      if (!sub) {
        return json(
          {
            error:
              "No se encontró una factura con el UUID sustituto proporcionado.",
          },
          400,
        );
      }
      if (sub.cfdi_status !== "stamped") {
        return json(
          { error: "La factura sustituta debe estar timbrada y vigente." },
          400,
        );
      }
      if (
        inv.customer_id != null && sub.customer_id != null &&
        inv.customer_id !== sub.customer_id
      ) {
        return json(
          { error: "La factura sustituta debe pertenecer al mismo cliente." },
          400,
        );
      }
    }

    const { apiKey, mode } = await getFacturapiConfig(supabase, deps.env);
    const facturApiId = inv.facturapi_invoice_id as string | null | undefined;

    let satStatus = "accepted";
    const isStub = !apiKey || !facturApiId;

    if (isStub && mode === "live") {
      // C-2: en modo live NUNCA marcamos "aceptada" una cancelación stub.
      // Un stub en live significa (a) API key faltante o (b) factura sin
      // facturapi_invoice_id (probablemente timbrada como stub en test y
      // migrada a live). Cancelarla fake dejaría el SAT y la BD divergentes.
      return json(
        {
          error: !apiKey
            ? "Facturapi API key no configurada para modo live. No se puede cancelar sin llamar al SAT."
            : "La factura no tiene facturapi_invoice_id (no fue timbrada realmente). No se puede cancelar en modo live.",
        },
        400,
      );
    }

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
        // BL-44: encolar reintento solo si el error es transitorio (5xx / red /
        // 429) — la cancelación NO llegó al SAT, así que reintentar es seguro.
        // El payload va plano: el consumer de la cola lo esparce tal cual al
        // reinvocar esta función (junto con invoice_id) y `motive` es
        // obligatorio en cada llamada.
        if (isTransientFacturapiError(desc)) {
          await enqueueCfdiRetry(supabase, {
            operation: "cancel",
            invoiceId: invoice_id as string,
            payload: {
              motive,
              ...(motive === "01" && substitution_uuid
                ? { substitution_uuid }
                : {}),
              ...(cancellation_reason ? { cancellation_reason } : {}),
            },
            errorMessage: `${desc.code ?? ""} ${desc.message}`.trim(),
          });
        }
        return json(
          {
            error: `Facturapi cancel error: ${desc.status}`,
            detail: desc.detail,
            transient: isTransientFacturapiError(desc),
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
