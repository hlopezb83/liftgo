import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Unit tests puros para la lógica de detección de facturas atascadas.
// El handler HTTP se prueba en integración manual (ver README de la función).

interface StuckRow {
  id: string;
  cfdi_uuid: string | null;
  facturapi_invoice_id: string | null;
  updated_at: string;
}

function needsReconcile(row: StuckRow): boolean {
  return Boolean(row.cfdi_uuid && row.facturapi_invoice_id);
}

function needsRevert(row: StuckRow): boolean {
  return !row.cfdi_uuid || !row.facturapi_invoice_id;
}

Deno.test("needsReconcile: fila con uuid + facturapi_id se puede reconciliar", () => {
  assertEquals(
    needsReconcile({
      id: "a",
      cfdi_uuid: "uuid-1",
      facturapi_invoice_id: "fa-1",
      updated_at: new Date().toISOString(),
    }),
    true,
  );
});

Deno.test("needsRevert: fila sin facturapi_invoice_id se revierte a error", () => {
  assertEquals(
    needsRevert({
      id: "a",
      cfdi_uuid: null,
      facturapi_invoice_id: null,
      updated_at: new Date().toISOString(),
    }),
    true,
  );
});

Deno.test("needsRevert: fila con uuid pero sin facturapi_invoice_id también se revierte", () => {
  assertEquals(
    needsRevert({
      id: "a",
      cfdi_uuid: "uuid-1",
      facturapi_invoice_id: null,
      updated_at: new Date().toISOString(),
    }),
    true,
  );
});

Deno.test("umbral de stale: 10 min", () => {
  const STALE_THRESHOLD_MIN = 10;
  const cutoff = Date.now() - STALE_THRESHOLD_MIN * 60_000;
  const stale = Date.now() - 15 * 60_000;
  const fresh = Date.now() - 5 * 60_000;
  assertEquals(stale < cutoff, true);
  assertEquals(fresh < cutoff, false);
});

// Política de reintentos de descarga de XML (espejo de la lógica en index.ts):
// si la descarga falla NO se llama al RPC — la fila sigue en 'stamping' y solo
// pasa a 'error' cuando el intento actual alcanza MAX_RECONCILE_ATTEMPTS.
function decideXmlFailure(
  stampingAttempts: number | null,
): "defer" | "mark_error" {
  const MAX_RECONCILE_ATTEMPTS = 10;
  const attempts = (stampingAttempts ?? 0) + 1;
  return attempts >= MAX_RECONCILE_ATTEMPTS ? "mark_error" : "defer";
}

Deno.test("xml retry: intentos 1-9 se difieren (fila sigue en stamping)", () => {
  assertEquals(decideXmlFailure(null), "defer");
  assertEquals(decideXmlFailure(0), "defer");
  assertEquals(decideXmlFailure(1), "defer");
  assertEquals(decideXmlFailure(8), "defer");
});

Deno.test("xml retry: intento 10+ marca error (fin de reintentos)", () => {
  assertEquals(decideXmlFailure(9), "mark_error");
  assertEquals(decideXmlFailure(10), "mark_error");
  assertEquals(decideXmlFailure(25), "mark_error");
});
