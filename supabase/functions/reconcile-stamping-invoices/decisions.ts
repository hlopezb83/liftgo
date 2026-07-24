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
  | { kind: "retry_lookup" } // PAC falló: reintentar en el próximo cron
  | { kind: "revert_error" }; // PAC confirma que no existe → error

export function decideRowAction(
  row: StuckRow,
  pac: PacLookup | null,
): RowAction {
  // Camino feliz: tenemos ambos identificadores.
  if (row.facturapi_invoice_id && row.cfdi_uuid) return { kind: "reconcile" };
  // R12-B2: sin identificadores NO se revierte de inmediato — primero se
  // consulta al PAC por external_id (la fila pudo timbrarse tras un timeout).
  if (pac?.kind === "hit") {
    return { kind: "recover", facturapi_id: pac.facturapi_id, uuid: pac.uuid };
  }
  if (pac?.kind === "lookup_failed") return { kind: "retry_lookup" };
  return { kind: "revert_error" }; // pac.kind === "miss": el PAC confirma que nunca se timbró
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
