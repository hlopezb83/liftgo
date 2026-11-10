// Política cerrada del ejecutor temporal Facturapi 6 (sandbox).
// Todo valor operativo es constante: el cuerpo de la petición sólo elige una
// acción de la lista cerrada y nunca aporta IDs, URLs, montos ni empresa.

export const RUN_ID = "fx6-sbx-20261110-01";
/**
 * Ventana fija y corta. Se fija en el commit revisado justo antes del despliegue
 * (el caller no puede renovarla). Fuera de [NOT_BEFORE, EXPIRES_AT) todo
 * responde 410 antes de autenticar. Duración máxima: MAX_WINDOW_MS.
 * Valor actual: propuesta para revisión; debe reajustarse al aprobar despliegue.
 */
export const RUN_NOT_BEFORE = Date.parse("2026-11-10T16:00:00Z");
export const RUN_EXPIRES_AT = Date.parse("2026-11-10T20:00:00Z");
export const MAX_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Interruptores de fase. Ambos permanecen false hasta revisión explícita.
 * - WRITE_PHASES_ENABLED: abre acciones con efecto fiscal/ERP.
 * - DURABLE_CLAIMS_GUARANTEED: sólo puede ponerse en true si el claim
 *   durable cumple inmutabilidad verificada (hoy NO; ver README).
 */
export const WRITE_PHASES_ENABLED = false;
export const DURABLE_CLAIMS_GUARANTEED = false;

export const TENANT_ORGANIZATION_ID = "fc2c10e3-278b-4899-8aa1-f802752f1c38";
export const TENANT_ORGANIZATION_NAME = "Empresa Prueba";
export const TENANT_LEGAL_NAME = "ELOGISTIX SHIPPING";

/** Topes de los datos ficticios para fases de escritura futuras. */
export const MAX_DOCUMENT_TOTAL_MXN = 116;
export const MAX_LINE_QUANTITY = 1;
export const MAX_DOCUMENTS_PER_RUN = 4;

export const PROVIDER_TIMEOUT_MS = 15_000;

/** Acciones conocidas. Sólo las de ENABLED_ACTIONS se ejecutan. */
export const KNOWN_ACTIONS = [
  "preflight",
  "stamp_invoice",
  "payment_and_rep",
  "credit_note",
  "cancel_run_invoice",
  "retrieve_and_update_status",
  "download_pdf_xml",
  "duplicate_request",
] as const;
export type RunAction = typeof KNOWN_ACTIONS[number];

/** Este candidato habilita únicamente la lectura previa. */
export const ENABLED_ACTIONS: readonly RunAction[] = ["preflight"];

export type Gate =
  | { ok: true }
  | { ok: false; status: number; code: string };

const deny = (status: number, code: string): Gate => ({
  ok: false,
  status,
  code,
});

export function checkExpiry(nowMs: number): Gate {
  if (
    !Number.isFinite(RUN_NOT_BEFORE) || !Number.isFinite(RUN_EXPIRES_AT) ||
    !Number.isFinite(nowMs) ||
    RUN_EXPIRES_AT <= RUN_NOT_BEFORE ||
    RUN_EXPIRES_AT - RUN_NOT_BEFORE > MAX_WINDOW_MS ||
    nowMs < RUN_NOT_BEFORE || nowMs >= RUN_EXPIRES_AT
  ) {
    return deny(410, "run_expired");
  }
  return { ok: true };
}

/**
 * Tiempo máximo para una llamada al proveedor: el menor entre el límite
 * fijo y lo que resta de la ventana. 0 = no enviar.
 */
export function providerDeadlineMs(nowMs: number): number {
  if (!checkExpiry(nowMs).ok) return 0;
  return Math.max(0, Math.min(PROVIDER_TIMEOUT_MS, RUN_EXPIRES_AT - nowMs));
}

export function parseAction(body: unknown): RunAction | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body as Record<string, unknown>);
  // Sólo se aceptan exactamente {action, run_id}; cualquier campo extra
  // (IDs, URLs, montos, organización) invalida la petición.
  if (
    keys.length !== 2 || !keys.includes("action") || !keys.includes("run_id")
  ) {
    return null;
  }
  const b = body as { action?: unknown; run_id?: unknown };
  if (b.run_id !== RUN_ID) return null;
  return (KNOWN_ACTIONS as readonly unknown[]).includes(b.action)
    ? b.action as RunAction
    : null;
}

export function checkActionEnabled(action: RunAction): Gate {
  return ENABLED_ACTIONS.includes(action)
    ? { ok: true }
    : deny(423, "phase_not_enabled");
}

export function checkTenant(callerOrganizationId: string | null): Gate {
  return callerOrganizationId === TENANT_ORGANIZATION_ID
    ? { ok: true }
    : deny(403, "tenant_not_allowed");
}

export function checkTestKey(
  mode: string | null | undefined,
  apiKey: string | null | undefined,
  fromEnvFallback: boolean,
): Gate {
  if (mode !== "test") return deny(409, "mode_not_test");
  if (fromEnvFallback) return deny(409, "env_fallback_not_allowed");
  if (typeof apiKey !== "string" || !apiKey.startsWith("sk_test_")) {
    return deny(409, "key_not_test");
  }
  return { ok: true };
}

export function normalizeName(v: unknown): string {
  return typeof v === "string"
    ? v.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase()
    : "";
}

export function normalizeRfc(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

/**
 * Compara el emisor que Facturapi asocia a la llave contra el ERP.
 * Sólo se devuelven booleanos; nunca valores fiscales.
 */
export function compareIssuer(input: {
  providerLegalName: unknown;
  providerTaxId: unknown;
  erpRazonSocial: unknown;
  erpRfc: unknown;
}): { legalNameMatches: boolean; taxIdMatches: boolean } {
  const expected = normalizeName(TENANT_LEGAL_NAME);
  const provider = normalizeName(input.providerLegalName);
  const erp = normalizeName(input.erpRazonSocial);
  const pRfc = normalizeRfc(input.providerTaxId);
  const eRfc = normalizeRfc(input.erpRfc);
  return {
    legalNameMatches: provider !== "" && provider === expected &&
      erp === expected,
    taxIdMatches: pRfc !== "" && pRfc === eRfc,
  };
}
