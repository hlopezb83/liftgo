import {
  type CreditNoteSourceValidation,
  validateCreditNoteSourceLines,
} from "../_shared/creditNoteSourceValidation.ts";
import { resolveDocumentOrganization } from "../_shared/orgContext.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { isUUID } from "../_shared/validate.ts";

export type JsonResponder = (body: unknown, status: number) => Response;
export type ValidSourceLines = Extract<
  CreditNoteSourceValidation,
  { ok: true }
>["lines"];

export interface ClaimedCreditNoteContext {
  creditNoteId: string;
  initialNcRow: Record<string, unknown>;
  ncRow: Record<string, unknown>;
  inv: Record<string, unknown>;
  organizationId: string;
  sourceLines: ValidSourceLines;
  releaseClaim: (errorMessage?: string) => Promise<void>;
}

function makeReleaseClaim(
  supabase: SupabaseLike,
  creditNoteId: string,
): (errorMessage?: string) => Promise<void> {
  return async (errorMessage?: string) => {
    await supabase
      .from("credit_notes")
      .update({
        cfdi_status: errorMessage ? "error" : "pending",
        ...(errorMessage
          ? { cfdi_error_message: errorMessage.slice(0, 1000) }
          : {}),
      })
      .eq("id", creditNoteId)
      .eq("cfdi_status", "stamping");
  };
}

async function checkInitialCreditNoteState(
  supabase: SupabaseLike,
  creditNoteId: string,
  userId: string | undefined,
  isServiceRole: boolean,
  json: JsonResponder,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; initialNcRow: Record<string, unknown>; organizationId: string }
> {
  const { data: nc, error: ncErr } = await supabase
    .from("credit_notes")
    .select("*")
    .eq("id", creditNoteId)
    .single();
  if (ncErr || !nc) {
    console.error("[stamp-credit-note] credit note not found", {
      credit_note_id: creditNoteId,
      userId,
      err: ncErr instanceof Error ? ncErr.message : String(ncErr),
    });
    return {
      ok: false,
      response: json({ error: "Credit note not found" }, 404),
    };
  }
  const initialNcRow = nc as Record<string, unknown>;

  const orgCheck = await resolveDocumentOrganization({
    admin: supabase,
    userId: userId ?? "",
    isServiceRole,
    documentOrganizationId: initialNcRow.organization_id as
      | string
      | null
      | undefined,
  });
  if (!orgCheck.ok) {
    console.error("[stamp-credit-note] organization check failed", {
      credit_note_id: creditNoteId,
      userId,
      status: orgCheck.status,
    });
    return {
      ok: false,
      response: json({ error: orgCheck.message }, orgCheck.status),
    };
  }

  if (initialNcRow.cfdi_status === "stamped") {
    console.error("[stamp-credit-note] already stamped", {
      credit_note_id: creditNoteId,
      uuid: initialNcRow.cfdi_uuid,
    });
    return {
      ok: false,
      response: json({ error: "Credit note already stamped" }, 409),
    };
  }
  if (initialNcRow.facturapi_invoice_id) {
    return {
      ok: false,
      response: json({
        error:
          "La NC ya tiene un ID de Facturapi. Espera la conciliación o revisa su estado antes de reemitir.",
      }, 409),
    };
  }
  return {
    ok: true,
    initialNcRow,
    organizationId: orgCheck.organizationId,
  };
}

async function verifySourceInvoiceAndOvercredit(
  supabase: SupabaseLike,
  creditNoteId: string,
  ncRow: Record<string, unknown>,
  releaseClaim: (errorMessage?: string) => Promise<void>,
  json: JsonResponder,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; inv: Record<string, unknown>; sourceLines: ValidSourceLines }
> {
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", ncRow.invoice_id)
    .single();
  if (invErr || !invoice) {
    console.error("[stamp-credit-note] source invoice not found", {
      credit_note_id: creditNoteId,
      invoice_id: ncRow.invoice_id,
    });
    await releaseClaim("Source invoice not found");
    return { ok: false, response: json({ error: "Invoice not found" }, 404) };
  }
  const inv = invoice as Record<string, unknown>;
  const sourceStamped = inv.cfdi_status === "stamped" &&
    Boolean(inv.facturapi_invoice_id) && Boolean(inv.cfdi_uuid);
  if (!sourceStamped) {
    console.error("[stamp-credit-note] source invoice not stamped", {
      credit_note_id: creditNoteId,
      invoice_id: ncRow.invoice_id,
      inv_cfdi_status: inv.cfdi_status,
    });
    await releaseClaim("Source invoice must be stamped");
    return {
      ok: false,
      response: json({ error: "Source invoice must be stamped" }, 400),
    };
  }

  const sourceValidation = validateCreditNoteSourceLines(ncRow, inv);
  if (!sourceValidation.ok) {
    await releaseClaim(sourceValidation.message);
    return {
      ok: false,
      response: json({
        error: sourceValidation.message,
        code: sourceValidation.code,
        recreate_required: sourceValidation.recreateRequired,
      }, 422),
    };
  }

  const { data: siblingNcs } = await supabase
    .from("credit_notes")
    .select("id, total, cfdi_status, cancellation_status, status")
    .eq("invoice_id", ncRow.invoice_id);
  const activeNcTotal = ((siblingNcs ?? []) as Array<Record<string, unknown>>)
    .filter(
      (n) => n.cancellation_status !== "accepted" && n.status !== "cancelled",
    )
    .reduce((s, n) => s + Number(n.total ?? 0), 0);
  const invoiceTotal = Number(inv.total ?? 0);
  if (activeNcTotal - 0.01 > invoiceTotal) {
    await releaseClaim(
      `Notas de crédito acumuladas (${
        activeNcTotal.toFixed(2)
      }) exceden el total facturado (${invoiceTotal.toFixed(2)}).`,
    );
    return {
      ok: false,
      response: json({
        error:
          `El monto total de notas de crédito excede el importe de la factura. Suma NCs: ${
            activeNcTotal.toFixed(2)
          } > factura ${invoiceTotal.toFixed(2)}.`,
      }, 400),
    };
  }

  return { ok: true, inv, sourceLines: sourceValidation.lines };
}

export async function claimAndValidateCreditNoteSource(params: {
  supabase: SupabaseLike;
  creditNoteIdRaw: unknown;
  userId: string | undefined;
  isServiceRole: boolean;
  json: JsonResponder;
  onClaimed: () => void;
}): Promise<
  | { ok: false; response: Response }
  | { ok: true; data: ClaimedCreditNoteContext }
> {
  const {
    supabase,
    creditNoteIdRaw,
    userId,
    isServiceRole,
    json,
    onClaimed,
  } = params;
  if (!isUUID(creditNoteIdRaw)) {
    console.error("[stamp-credit-note] invalid credit_note_id", { userId });
    return {
      ok: false,
      response: json({ error: "credit_note_id must be UUID" }, 400),
    };
  }
  const creditNoteId = creditNoteIdRaw;

  const initial = await checkInitialCreditNoteState(
    supabase,
    creditNoteId,
    userId,
    isServiceRole,
    json,
  );
  if (!initial.ok) return initial;

  if (!supabase.rpc) {
    return {
      ok: false,
      response: json({ error: "Credit note claim RPC unavailable" }, 500),
    };
  }
  const claimRes = await supabase.rpc("claim_credit_note_for_stamping", {
    p_credit_note_id: creditNoteId,
  });
  if (claimRes.error) {
    console.error("[stamp-credit-note] claim RPC failed", {
      credit_note_id: creditNoteId,
      error: claimRes.error,
    });
    return {
      ok: false,
      response: json({ error: "Could not claim credit note" }, 500),
    };
  }
  if (!claimRes.data) {
    console.error(
      "[stamp-credit-note] claim failed — concurrent stamp or unexpected status",
      {
        credit_note_id: creditNoteId,
        current_status: initial.initialNcRow.cfdi_status,
      },
    );
    return {
      ok: false,
      response: json(
        { error: "Credit note already stamped or in progress" },
        409,
      ),
    };
  }

  onClaimed();
  const ncRow = claimRes.data as Record<string, unknown>;
  const releaseClaim = makeReleaseClaim(supabase, creditNoteId);

  const verified = await verifySourceInvoiceAndOvercredit(
    supabase,
    creditNoteId,
    ncRow,
    releaseClaim,
    json,
  );
  if (!verified.ok) return verified;

  return {
    ok: true,
    data: {
      creditNoteId,
      initialNcRow: initial.initialNcRow,
      ncRow,
      inv: verified.inv,
      organizationId: initial.organizationId,
      sourceLines: verified.sourceLines,
      releaseClaim,
    },
  };
}
