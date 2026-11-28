import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";
import { describeFacturapiError } from "../_shared/facturapi/client.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import {
  classifyInvoiceReadOutcome,
  decideStampRetry,
  resolveStampRetryOrganization,
  type StampInvoiceState,
} from "./decisions.ts";
import {
  type AdminClient,
  deferStamp,
  type QueueResult,
  type QueueRow,
} from "./invokeTarget.ts";
import {
  markOwnedQueueRow,
  type QueueLease,
  QueueMutationError,
} from "./queueLease.ts";
import { InvoiceRecoveryError } from "./recoveredInvoice.ts";
import {
  handleStampInvocationOutcome,
  resolveStampPacConfig,
  runPacRecoveryLookup,
} from "./stampPacLookup.ts";

export { handleStampInvocationOutcome };

interface StampCheckSuccess {
  kind: "ready";
  organizationId: string;
  invRowFull: unknown;
  state: StampInvoiceState | null;
}

async function applyStampDecision(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  state: StampInvoiceState | null;
}): Promise<QueueResult | null> {
  const { admin, lease, row, nextAttempts, state } = params;
  const stampDecision = decideStampRetry(state);
  if (stampDecision === "defer") {
    const status = await deferStamp(
      admin,
      lease,
      row,
      "Timbrado en conciliación sin referencia confirmada.",
    );
    return { id: row.id, status };
  }
  if (stampDecision === "rejected") {
    await markOwnedQueueRow(admin, lease, {
      status: "exhausted",
      last_error:
        "El estado de la factura no permite reintentar su timbrado.",
    });
    return { id: row.id, status: "exhausted" };
  }
  if (stampDecision !== "proceed") {
    await markOwnedQueueRow(admin, lease, {
      status: "succeeded",
      attempts: nextAttempts,
      deferrals: 0,
      last_error: null,
    });
    return { id: row.id, status: stampDecision };
  }
  return null;
}

async function evaluateInvoiceBeforeStamp(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
}): Promise<{ kind: "done"; result: QueueResult } | StampCheckSuccess> {
  const { admin, lease, row, nextAttempts } = params;
  const { data: invRowFull, error: invReadErr } = await admin
    .from("invoices")
    .select(
      "status, cfdi_status, cfdi_uuid, facturapi_invoice_id, organization_id, updated_at",
    )
    .eq("id", row.invoice_id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();

  const readOutcome = classifyInvoiceReadOutcome(
    invReadErr,
    invRowFull as { organization_id?: string | null } | null,
  );
  if (readOutcome.kind === "deferred") {
    console.warn(
      "[process-cfdi-retry-queue] lectura de invoices falló; se difiere",
      {
        invoice_id: row.invoice_id,
        err: (invReadErr as { message?: string })?.message ??
          String(invReadErr),
      },
    );
    await markOwnedQueueRow(admin, lease, {
      status: "pending",
      attempts: row.attempts,
      last_error: "Lectura de la factura no disponible; reintento diferido.",
      next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
    });
    return {
      kind: "done",
      result: { id: row.id, status: "deferred_invoice_read_error" },
    };
  }

  const orgOutcome = resolveStampRetryOrganization(
    invRowFull as { organization_id?: string | null } | null,
  );
  if (orgOutcome.kind === "no_organization") {
    console.error(
      "[process-cfdi-retry-queue] documento no disponible en la empresa del trabajo",
      { invoice_id: row.invoice_id },
    );
    await markOwnedQueueRow(admin, lease, {
      status: "exhausted",
      attempts: nextAttempts,
      last_error:
        "Documento no disponible en la empresa del trabajo; no se puede resolver Facturapi.",
    });
    return { kind: "done", result: { id: row.id, status: "exhausted" } };
  }

  const state = invRowFull as StampInvoiceState | null;
  const decisionResult = await applyStampDecision({
    admin,
    lease,
    row,
    nextAttempts,
    state,
  });
  if (decisionResult) return { kind: "done", result: decisionResult };

  return {
    kind: "ready",
    organizationId: orgOutcome.organizationId,
    invRowFull,
    state,
  };
}

export async function prepareStampRow(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  envGet: (key: string) => string | undefined;
  lookup?: typeof lookupPacInvoice;
}): Promise<QueueResult | null> {
  const { admin, lease, row, nextAttempts, envGet } = params;
  const check = await evaluateInvoiceBeforeStamp({
    admin,
    lease,
    row,
    nextAttempts,
  });
  if (check.kind === "done") return check.result;

  const { apiKey, pacMode } = await resolveStampPacConfig({
    admin,
    envGet,
    organizationId: check.organizationId,
    lease,
    row,
  });

  try {
    if (apiKey && pacMode) {
      const recovered = await runPacRecoveryLookup({
        admin,
        lease,
        row,
        nextAttempts,
        apiKey,
        pacMode,
        invRowFull: check.invRowFull,
        facturapiInvoiceId: check.state?.facturapi_invoice_id ?? null,
        lookupFn: params.lookup ?? lookupPacInvoice,
      });
      if (recovered) return recovered;
    }
  } catch (lookupErr) {
    if (
      lookupErr instanceof QueueMutationError ||
      lookupErr instanceof InvoiceRecoveryError
    ) throw lookupErr;
    console.warn("[process-cfdi-retry-queue] pac lookup failed, deferring", {
      invoice_id: row.invoice_id,
      err: describeFacturapiError(lookupErr).message,
    });
    await markOwnedQueueRow(admin, lease, {
      status: "pending",
      attempts: row.attempts,
      last_error: "PAC lookup no disponible antes de re-timbrar",
      next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
    });
    return { id: row.id, status: "retry_lookup_deferred" };
  }

  if (!apiKey) {
    console.warn(
      "[process-cfdi-retry-queue] no PAC apiKey, deferring re-stamp",
      { invoice_id: row.invoice_id },
    );
    await markOwnedQueueRow(admin, lease, {
      status: "pending",
      attempts: row.attempts,
      last_error: "Facturapi key no configurada; re-timbrado diferido",
      next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
    });
    return { id: row.id, status: "retry_deferred_no_apikey" };
  }
  return null;
}
