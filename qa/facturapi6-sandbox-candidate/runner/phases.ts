// Fases con efecto: invocan los handlers AUTÉNTICOS del snapshot (no un flujo
// SDK alterno). Permanecen cerradas: WRITE_PHASES_ENABLED y
// DURABLE_CLAIMS_GUARANTEED son false. Ninguna fase acepta IDs del caller;
// los documentos salen del manifiesto de fixtures del propio run.
import { handleStampCfdi } from "../snapshot/supabase/functions/stamp-cfdi/handler.ts";
import { handleStampPaymentComplement } from "../snapshot/supabase/functions/stamp-payment-complement/handler.ts";
import { handleStampCreditNote } from "../snapshot/supabase/functions/stamp-credit-note/handler.ts";
import { handleCancelCfdi } from "../snapshot/supabase/functions/cancel-cfdi/handler.ts";
import { handleDownloadCfdi } from "../snapshot/supabase/functions/download-cfdi/handler.ts";
import { createInvoiceGateway } from "../snapshot/supabase/functions/stamp-cfdi/invoiceGateway.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import { ClaimUncertain, type ClaimStore } from "./claims.ts";
import type { Db } from "./db.ts";
import { restrictEnv, restrictSecretsView } from "./guards.ts";
import {
  checkExpiry,
  DURABLE_CLAIMS_GUARANTEED,
  MAX_DOCUMENT_TOTAL_MXN,
  MAX_DOCUMENTS_PER_RUN,
  MAX_LINE_QUANTITY,
  RUN_ID,
  type RunAction,
  TENANT_ORGANIZATION_ID,
  WRITE_PHASES_ENABLED,
} from "./policy.ts";

/** Documentos ficticios creados por el run (nunca IDs del caller). */
export interface RunFixtures {
  run_id: string;
  organization_id: string;
  invoice_id: string;
  payment_id: string;
  credit_note_id: string;
  invoice_total_mxn: number;
  payment_amount_mxn: number;
  credit_note_total_mxn: number;
  max_line_quantity: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateFixtures(f: unknown): f is RunFixtures {
  const x = f as RunFixtures;
  if (!x || typeof x !== "object") return false;
  if (x.run_id !== RUN_ID || x.organization_id !== TENANT_ORGANIZATION_ID) return false;
  if (![x.invoice_id, x.payment_id, x.credit_note_id].every((id) => typeof id === "string" && UUID.test(id))) return false;
  const amounts = [x.invoice_total_mxn, x.payment_amount_mxn, x.credit_note_total_mxn];
  if (!amounts.every((a) => typeof a === "number" && Number.isFinite(a) && a > 0 && a <= MAX_DOCUMENT_TOTAL_MXN)) return false;
  if (x.payment_amount_mxn > x.invoice_total_mxn || x.credit_note_total_mxn > x.invoice_total_mxn) return false;
  return x.max_line_quantity === MAX_LINE_QUANTITY;
}

type HandlerCall = (f: RunFixtures, ctx: PhaseCtx) => { handler: string; body: Record<string, unknown>; run: (req: Request) => Promise<Response> };

export interface PhaseCtx {
  serviceClient: () => SupabaseLike;
  callerClient: (h: string) => SupabaseLike;
  env: (k: string) => string | undefined;
  fetchImpl: typeof fetch;
}

/**
 * Plan de fases. `documents` = CFDI nuevos que puede emitir la fase.
 * `retrieve_and_update_status` no tiene handler en el cierre revisado
 * (vive en refresh-cancellation-status, fuera del snapshot): queda bloqueada.
 */
export type WriteAction = Exclude<RunAction, "preflight">;
export type PhasePlan = Record<WriteAction, { documents: number; call: HandlerCall | null }>;

export const PHASES: PhasePlan = {
  stamp_invoice: {
    documents: 1,
    call: (f, c) => ({
      handler: "stamp-cfdi",
      body: { invoice_id: f.invoice_id },
      run: (req) => handleStampCfdi(req, { createCallerClient: c.callerClient, createServiceClient: c.serviceClient, createInvoiceGateway, env: c.env }),
    }),
  },
  duplicate_request: {
    documents: 0,
    call: (f, c) => ({
      handler: "stamp-cfdi",
      body: { invoice_id: f.invoice_id },
      run: (req) => handleStampCfdi(req, { createCallerClient: c.callerClient, createServiceClient: c.serviceClient, createInvoiceGateway, env: c.env }),
    }),
  },
  payment_and_rep: {
    documents: 1,
    call: (f, c) => ({
      handler: "stamp-payment-complement",
      body: { payment_id: f.payment_id },
      run: (req) => handleStampPaymentComplement(req, { createCallerClient: c.callerClient, createServiceClient: c.serviceClient, fetchImpl: c.fetchImpl, env: c.env }),
    }),
  },
  credit_note: {
    documents: 1,
    call: (f, c) => ({
      handler: "stamp-credit-note",
      body: { credit_note_id: f.credit_note_id },
      run: (req) => handleStampCreditNote(req, { createCallerClient: c.callerClient, createServiceClient: c.serviceClient, fetchImpl: c.fetchImpl, env: c.env }),
    }),
  },
  download_pdf_xml: {
    documents: 0,
    call: (f, c) => ({
      handler: "download-cfdi",
      body: { invoice_id: f.invoice_id, format: "xml" },
      run: (req) => handleDownloadCfdi(req, { createCallerClient: () => c.callerClient(req.headers.get("Authorization") ?? ""), createServiceClient: c.serviceClient as never, fetchImpl: c.fetchImpl, env: c.env }),
    }),
  },
  cancel_run_invoice: {
    documents: 0,
    call: (f, c) => ({
      handler: "cancel-cfdi",
      // Motivo 02 (sin relación): sólo la factura ficticia del propio run.
      body: { invoice_id: f.invoice_id, motive: "02" },
      run: (req) => handleCancelCfdi(req, { createCallerClient: c.callerClient, createServiceClient: c.serviceClient, fetchImpl: c.fetchImpl, env: c.env } as never),
    }),
  },
  retrieve_and_update_status: { documents: 0, call: null },
};

export const TOTAL_PLANNED_DOCUMENTS = Object.values(PHASES).reduce((n, p) => n + p.documents, 0);
if (TOTAL_PLANNED_DOCUMENTS > MAX_DOCUMENTS_PER_RUN) throw new Error("plan_exceeds_document_cap");

const ALLOWED_HOSTS = new Set(["www.facturapi.io"]);

/** fetch del handler: sólo Facturapi y el propio backend; nada más. */
export function guardedFetch(base: typeof fetch, supabaseUrl: string | undefined): typeof fetch {
  const own = supabaseUrl ? new URL(supabaseUrl).host : null;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || !(ALLOWED_HOSTS.has(url.host) || url.host === own)) {
      return Promise.reject(new Error("host_not_allowed"));
    }
    return base(input, init);
  }) as typeof fetch;
}

export interface WritePhaseDeps {
  now: () => number;
  claims: ClaimStore;
  loadFixtures: () => Promise<unknown>;
  ctx: PhaseCtx;
  /** Overrides sólo para pruebas: nunca se exponen al caller. */
  gates?: { writeEnabled: boolean; claimsGuaranteed: boolean };
  /** Sólo pruebas: sustituye el plan para no ejecutar handlers reales. */
  phases?: PhasePlan;
}

export type PhaseOutcome = { status: number; body: Record<string, unknown> };

const out = (status: number, body: Record<string, unknown>): PhaseOutcome => ({ status, body: { run_id: RUN_ID, ...body } });

/** Se llama DESPUÉS de strictIdentity. Cada efecto ocurre a lo sumo una vez. */
export async function runWritePhase(
  action: WriteAction,
  authHeader: string,
  deps: WritePhaseDeps,
): Promise<PhaseOutcome> {
  const gates = deps.gates ?? { writeEnabled: WRITE_PHASES_ENABLED, claimsGuaranteed: DURABLE_CLAIMS_GUARANTEED };
  if (!gates.writeEnabled) return out(423, { error: "phase_not_enabled" });
  if (!gates.claimsGuaranteed) return out(423, { error: "durable_claim_unverified" });
  const phase = (deps.phases ?? PHASES)[action];
  if (!phase?.call) return out(423, { error: "handler_not_in_reviewed_closure" });

  const open = async () => {
    const e = checkExpiry(deps.now());
    if (!e.ok) return out(e.status, { error: e.code });
    try {
      if ((await deps.claims.state()) !== "open") return out(423, { error: "run_disabled" });
    } catch {
      return out(503, { error: "run_state_unverifiable" });
    }
    return null;
  };
  const closed = await open();
  if (closed) return closed;

  let fixtures: unknown;
  try {
    fixtures = await deps.loadFixtures();
  } catch {
    return out(503, { error: "fixtures_unreadable" });
  }
  if (!validateFixtures(fixtures)) return out(409, { error: "fixtures_missing_or_invalid" });

  let reserved;
  try {
    reserved = await deps.claims.reserve(action, { documents: phase.documents });
  } catch (e) {
    await bestEffortDisable(deps.claims, e instanceof ClaimUncertain ? e.message : "claim_error");
    return out(409, { error: "claim_uncertain_run_disabled" });
  }
  if (reserved === "already_claimed") return out(409, { error: "action_already_claimed" });

  // Revalidar justo antes del efecto: caducidad y cierre durable.
  const closedNow = await open();
  if (closedNow) {
    await bestEffortDisable(deps.claims, "closed_before_effect");
    return closedNow;
  }

  const call = phase.call(fixtures, deps.ctx);
  const req = new Request(`https://fx6-sandbox.invalid/${call.handler}`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(call.body),
  });
  let res: Response;
  try {
    res = await call.run(req);
  } catch {
    await bestEffortDisable(deps.claims, `${action}_exception`);
    return out(409, { error: "effect_uncertain_run_disabled", handler: call.handler });
  }
  const success = action === "duplicate_request" ? res.status >= 400 && res.status < 500 : res.ok;
  if (!success) {
    // No se reintenta. Ante timeout/5xx el documento se consulta por su propio ID
    // en una fase posterior revisada; nunca se reemite.
    await bestEffortDisable(deps.claims, `${action}_status_${res.status}`);
    return out(409, { error: "phase_failed_run_disabled", handler: call.handler, handler_status: res.status });
  }
  return out(200, { action, handler: call.handler, handler_status: res.status, documents_reserved: phase.documents });
}

async function bestEffortDisable(claims: ClaimStore, reason: string) {
  try {
    await claims.disable(reason);
  } catch { /* el claim de la acción ya impide repetir; estado queda "no verificable" */ }
}

export function buildPhaseCtx(raw: {
  serviceClient: () => SupabaseLike;
  callerClient: (h: string) => SupabaseLike;
  env: (k: string) => string | undefined;
  fetchImpl: typeof fetch;
}): PhaseCtx {
  return {
    serviceClient: () => restrictSecretsView(raw.serviceClient() as unknown as Db) as unknown as SupabaseLike,
    callerClient: raw.callerClient,
    env: restrictEnv(raw.env),
    fetchImpl: guardedFetch(raw.fetchImpl, raw.env("SUPABASE_URL")),
  };
}
