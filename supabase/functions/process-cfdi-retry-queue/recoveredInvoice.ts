import type { OrgQueryClient } from "../_shared/orgContext.ts";
import type { PacLookup } from "../_shared/facturapi/invoiceRecovery.ts";
import { assertOwnedQueue, type QueueLease } from "./queueLease.ts";

export type RecoveryInvoice = {
  organization_id: string;
  updated_at: string;
  cfdi_status: string;
};
export class InvoiceRecoveryError extends Error {
  constructor(readonly kind: "document_changed" | "recovery_write_error") {
    super(
      kind === "document_changed"
        ? "Invoice changed"
        : "Recovered invoice write unavailable",
    );
    this.name = "InvoiceRecoveryError";
  }
}

/** Guardar el resultado del PAC antes de cerrar la cola; jamás marcar stamped aquí. */
export async function saveRecoveredInvoice(
  admin: OrgQueryClient,
  lease: QueueLease,
  invoiceId: string,
  invoice: RecoveryInvoice,
  pac: Extract<PacLookup, { kind: "hit" | "pending" | "failed" }>,
  mode: "test" | "live",
): Promise<void> {
  if (invoice.organization_id !== lease.organizationId || !invoice.updated_at) {
    throw new InvoiceRecoveryError("document_changed");
  }
  await assertOwnedQueue(admin, lease);
  const patch = pac.kind === "failed"
    ? {
      facturapi_invoice_id: pac.facturapi_id,
      facturapi_env: mode,
      cfdi_status: "error",
      cfdi_error_message:
        "Facturapi confirmó fallo del timbrado. Revisión manual requerida.",
    }
    : {
      facturapi_invoice_id: pac.facturapi_id,
      facturapi_env: mode,
      ...(pac.kind === "hit" ? { cfdi_uuid: pac.uuid } : {}),
      cfdi_status: "stamping",
    };
  let result;
  try {
    result = await admin.from("invoices").update(patch)
      .eq("id", invoiceId).eq("organization_id", lease.organizationId)
      .eq("updated_at", invoice.updated_at).eq(
        "cfdi_status",
        invoice.cfdi_status,
      )
      .is("cfdi_uuid", null).is("facturapi_invoice_id", null)
      .select("id").maybeSingle();
  } catch {
    throw new InvoiceRecoveryError("recovery_write_error");
  }
  if (result.error) throw new InvoiceRecoveryError("recovery_write_error");
  if (!result.data) throw new InvoiceRecoveryError("document_changed");
}
