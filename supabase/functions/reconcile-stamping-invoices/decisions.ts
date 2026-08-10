// TESTS-ARQ2 (v7.220.0 DIFF 2): decisión pura por fila atascada en `stamping`.
// Fuente única usada por index.ts y por el test (antes el test reimplementaba
// la lógica y congelaba la semántica VIEJA — "sin facturapi_id → revertir a
// error" — el comportamiento que duplicaba CFDIs y que R12-B2 eliminó).
export interface StuckRow {
  id: string;
  cfdi_uuid: string | null;
  facturapi_invoice_id: string | null;
  stamping_attempts: number | null;
}

export type PacLookup =
  | { kind: "hit"; facturapi_id: string; uuid: string }
  | { kind: "miss" }
  | { kind: "lookup_failed" };

export type RowAction =
  | { kind: "reconcile" } // descargar XML/PDF con facturapi_id + uuid
  | { kind: "recover"; facturapi_id: string; uuid: string } // R12-B2: recuperado vía external_id
  // N9: `consume_attempt` distingue un miss REAL (consume el presupuesto de
  // reintentos) de un lookup_failed (PAC caído / SDK sin list → NO consume:
  // no aprendimos nada del PAC en este ciclo).
  | { kind: "retry_lookup"; consume_attempt: boolean }
  | { kind: "revert_error" }; // PAC confirma que no existe → error

export function decideRowAction(
  row: StuckRow,
  pac: PacLookup,
): RowAction {
  // Camino feliz: tenemos ambos identificadores.
  if (row.facturapi_invoice_id && row.cfdi_uuid) return { kind: "reconcile" };
  // R12-B2: sin identificadores NO se revierte de inmediato — primero se
  // consulta al PAC por external_id (la fila pudo timbrarse tras un timeout).
  if (pac.kind === "hit") {
    return { kind: "recover", facturapi_id: pac.facturapi_id, uuid: pac.uuid };
  }
  // N9: lookup_failed NO consume el presupuesto de misses — con el PAC caído
  // MAX_STAMPING_ATTEMPTS ciclos seguidos, el primer miss real ya no revierte
  // de inmediato.
  if (pac.kind === "lookup_failed") {
    return { kind: "retry_lookup", consume_attempt: false };
  }
  // H6: un "miss" de búsqueda no es prueba definitiva (búsquedas del PAC son
  // eventualmente consistentes; un lookup indisponible tampoco). Reintentamos
  // hasta agotar MAX_STAMPING_ATTEMPTS; solo entonces, con el PAC respondiendo
  // consistentemente que no existe, es seguro revertir a 'error' (sin uuid,
  // estado re-timbrable).
  // Bajo-5 (R2): la rama `pac === null` era inalcanzable — index.ts siempre
  // pasa un PacLookup (SDK sin list → lookup_failed desde FIX-R2-02). Se
  // elimina; el "miss" es el camino terminal.
  const attempts = (row.stamping_attempts ?? 0) + 1;
  return attempts >= MAX_STAMPING_ATTEMPTS
    ? { kind: "revert_error" }
    : { kind: "retry_lookup", consume_attempt: true };
}

// Política de reintentos de descarga de XML (espejo de la lógica en index.ts).
// Extraído aquí para que el test importe la constante real en vez de duplicarla.
export const MAX_STAMPING_ATTEMPTS = 10;

export function decideXmlFailure(
  stampingAttempts: number | null,
): "defer" | "mark_error" {
  const attempts = (stampingAttempts ?? 0) + 1;
  return attempts >= MAX_STAMPING_ATTEMPTS ? "mark_error" : "defer";
}

// N5 (R2): misses CONSECUTIVOS del lookup al PAC tolerados antes de revertir
// un REP/NC a 'error'. 5 ciclos ≈ 25 min con el cron de 5 min — margen para
// que Facturapi indexe el documento recién timbrado.
export const MAX_LOOKUP_MISSES = 5;

export type LookupOutcome =
  | { kind: "recover"; facturapi_id: string; uuid: string }
  | { kind: "defer"; consume_attempt: boolean }
  | { kind: "revert" };

/**
 * N5/N9 (R2): decisión pura para REP/NC atascados sin ids persistidos.
 *  - hit           → recover (persistir ids y reconciliar).
 *  - lookup_failed → defer SIN consumir presupuesto (PAC caído o SDK sin
 *                    invoices.list: nunca se consultó → jamás revertir).
 *  - miss          → consume 1 intento; solo tras MAX_LOOKUP_MISSES misses
 *                    consecutivos con el PAC respondiendo es seguro revertir
 *                    a 'error' (antes: revert al primer miss → re-timbrado →
 *                    CFDI duplicado ante el SAT).
 */
export function decideLookupOutcome(
  pac: PacLookup,
  lookupAttempts: number | null,
): LookupOutcome {
  if (pac.kind === "hit") {
    return { kind: "recover", facturapi_id: pac.facturapi_id, uuid: pac.uuid };
  }
  if (pac.kind === "lookup_failed") {
    return { kind: "defer", consume_attempt: false };
  }
  const attempts = (lookupAttempts ?? 0) + 1;
  return attempts >= MAX_LOOKUP_MISSES
    ? { kind: "revert" }
    : { kind: "defer", consume_attempt: true };
}
