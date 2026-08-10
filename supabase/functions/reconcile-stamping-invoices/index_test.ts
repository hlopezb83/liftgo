// TESTS-ARQ2 (v7.220.0 DIFF 2): tests importan la decisión REAL desde
// `decisions.ts` (antes reimplementaban la lógica y congelaban la semántica
// vieja pre-R12-B2 que duplicaba CFDIs en el SAT).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideLookupOutcome,
  decideRowAction,
  decideXmlFailure,
  MAX_LOOKUP_MISSES,
  MAX_STAMPING_ATTEMPTS,
} from "./decisions.ts";

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
      { kind: "miss" }, // irrelevante: reconcile cortocircuita antes de leer pac
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
    { kind: "retry_lookup", consume_attempt: false },
  );
});

Deno.test("H6: primer 'miss' del PAC → retry_lookup (no revierte todavía)", () => {
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
    { kind: "retry_lookup", consume_attempt: true },
  );
});

Deno.test("H6: 'miss' al agotar MAX_STAMPING_ATTEMPTS → revert_error", () => {
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: null,
        facturapi_invoice_id: null,
        stamping_attempts: MAX_STAMPING_ATTEMPTS - 1,
      },
      { kind: "miss" },
    ),
    { kind: "revert_error" },
  );
});

Deno.test("Bajo-5: SDK sin invoices.list → lookup_failed → NUNCA revert (contrato real de index.ts)", () => {
  // index.ts mapea "SDK sin list" a { kind: "lookup_failed" } (FIX-R2-02).
  // Este test congela el contrato sobre el código REAL: ni siquiera con el
  // presupuesto de intentos agotado se revierte sin haber consultado al PAC.
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: null,
        facturapi_invoice_id: null,
        stamping_attempts: 999,
      },
      { kind: "lookup_failed" },
    ),
    { kind: "retry_lookup", consume_attempt: false },
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

Deno.test("N9: lookup_failed con presupuesto casi agotado → sigue sin consumir ni revertir", () => {
  assertEquals(
    decideRowAction(
      {
        id: "a",
        cfdi_uuid: null,
        facturapi_invoice_id: null,
        stamping_attempts: MAX_STAMPING_ATTEMPTS - 1,
      },
      { kind: "lookup_failed" },
    ),
    { kind: "retry_lookup", consume_attempt: false },
  );
});

// ── N5 (R2): decideLookupOutcome — REP/NC ya no revierten al primer miss ──

Deno.test("N5: hit del PAC → recover con ids", () => {
  assertEquals(
    decideLookupOutcome({ kind: "hit", facturapi_id: "f1", uuid: "u1" }, 0),
    { kind: "recover", facturapi_id: "f1", uuid: "u1" },
  );
});

Deno.test("N5: misses 1..N-1 → defer consumiendo intento (NO revert al primer miss)", () => {
  assertEquals(
    decideLookupOutcome({ kind: "miss" }, null),
    { kind: "defer", consume_attempt: true },
  );
  assertEquals(
    decideLookupOutcome({ kind: "miss" }, MAX_LOOKUP_MISSES - 2),
    { kind: "defer", consume_attempt: true },
  );
});

Deno.test("N5: miss número MAX_LOOKUP_MISSES consecutivo → revert", () => {
  assertEquals(
    decideLookupOutcome({ kind: "miss" }, MAX_LOOKUP_MISSES - 1),
    { kind: "revert" },
  );
});

Deno.test("N9: lookup_failed nunca consume presupuesto ni revierte", () => {
  assertEquals(
    decideLookupOutcome({ kind: "lookup_failed" }, null),
    { kind: "defer", consume_attempt: false },
  );
  assertEquals(
    decideLookupOutcome({ kind: "lookup_failed" }, 999),
    { kind: "defer", consume_attempt: false },
  );
});
