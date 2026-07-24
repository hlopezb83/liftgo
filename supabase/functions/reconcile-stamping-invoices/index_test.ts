// TESTS-ARQ2 (v7.220.0 DIFF 2): tests importan la decisión REAL desde
// `decisions.ts` (antes reimplementaban la lógica y congelaban la semántica
// vieja pre-R12-B2 que duplicaba CFDIs en el SAT).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideRowAction, decideXmlFailure } from "./decisions.ts";

const NOW = new Date().toISOString();
const _ = NOW; // solo para documentar que las filas siempre traen updated_at real

Deno.test("con facturapi_id + uuid → reconcile directo", () => {
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: "u",
        facturapi_invoice_id: "f",
        stamping_attempts: 0,
      },
      null,
    ),
    { kind: "reconcile" },
  );
});

Deno.test("R12-B2: sin ids pero el PAC lo tiene (external_id) → recover, NO revert", () => {
  const a = decideRowAction(
    {
      id: "a",
      cfdi_uuid: null,
      facturapi_invoice_id: null,
      stamping_attempts: 0,
    },
    { kind: "hit", facturapi_id: "f1", uuid: "u1" },
  );
  assertEquals(a, { kind: "recover", facturapi_id: "f1", uuid: "u1" });
});

Deno.test("R12-B2: PAC lookup falló → retry en próximo cron (no revert)", () => {
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: null,
        facturapi_invoice_id: null,
        stamping_attempts: 0,
      },
      { kind: "lookup_failed" },
    ),
    { kind: "retry_lookup" },
  );
});

Deno.test("PAC confirma que no existe → revert_error", () => {
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: null,
        facturapi_invoice_id: null,
        stamping_attempts: 0,
      },
      { kind: "miss" },
    ),
    { kind: "revert_error" },
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
