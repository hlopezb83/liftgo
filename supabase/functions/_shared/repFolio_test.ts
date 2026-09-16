// Multiempresa · Tramo 8.1 — pruebas aisladas del asignador de folio REP.
// Sin red y sin base: se ejercita el contrato del helper con un mock que
// registra los argumentos enviados a la RPC (para probar el scope por empresa).
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assignRepFolio, repFolioPendingMessage } from "./repFolio.ts";
import { buildSupabaseMock } from "./test/supabaseClientMock.ts";
import type { SupabaseLike } from "./types.ts";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PAY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

Deno.test("flujo válido: asigna CP-0007 y envía la organización del pago (A)", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: "CP-0007", error: null } },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  assert(res.ok);
  assertEquals(res.repNumber, "CP-0007");
  assertEquals(res.alreadyAssigned, false);
  assertEquals(mock.rpcCalls.length, 1);
  assertEquals(mock.rpcCalls[0].fn, "assign_stamped_rep_number");
  assertEquals(mock.rpcCalls[0].args?.p_organization_id, ORG_A);
  assertEquals(mock.rpcCalls[0].args?.p_folio, "7");
});

Deno.test("flujo válido en la empresa B: nunca reutiliza la organización de A", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: "CP-0007", error: null } },
  });
  await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_B,
    folio: "7",
  });
  assertEquals(mock.rpcCalls[0].args?.p_organization_id, ORG_B);
});

Deno.test("pago de otra organización: la RPC rechaza y el helper NO devuelve éxito", async () => {
  const mock = buildSupabaseMock({
    rpcs: {
      assign_stamped_rep_number: {
        data: null,
        error: { message: "payment belongs to another organization" },
      },
    },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_B,
    folio: 7,
  });
  assert(!res.ok);
  assertEquals(res.code, "cross_organization");
});

Deno.test("pago sin empresa: falla antes de tocar la base (fail-closed)", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: "CP-0007", error: null } },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: null,
    folio: 7,
  });
  assert(!res.ok);
  assertEquals(res.code, "cross_organization");
  assertEquals(mock.rpcCalls.length, 0);
});

Deno.test("sin folio del PAC: no hay éxito con rep_number nulo", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: "CP-0007", error: null } },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: null,
  });
  assert(!res.ok);
  assertEquals(res.code, "missing_folio");
  assertEquals(mock.rpcCalls.length, 0);
});

Deno.test("colisión de folio: se clasifica como collision, sin éxito silencioso", async () => {
  const mock = buildSupabaseMock({
    rpcs: {
      assign_stamped_rep_number: {
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "payments_rep_number_uidx"',
        },
      },
    },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  assert(!res.ok);
  assertEquals(res.code, "collision");
});

Deno.test("doble ejecución: la segunda es idempotente y devuelve el mismo folio", async () => {
  const mock = buildSupabaseMock({
    rpcsSeq: {
      assign_stamped_rep_number: [
        { data: "CP-0007", error: null },
        { data: "CP-0007", error: null },
      ],
    },
  });
  const first = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  const second = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  assert(first.ok && second.ok);
  assertEquals(second.repNumber, first.repNumber);
  assertEquals(mock.rpcCalls.length, 2);
});

Deno.test("recuperación de rep_number nulo: folio distinto se reporta como ya asignado", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: "CP-0003", error: null } },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  assert(res.ok);
  assertEquals(res.repNumber, "CP-0003");
  assertEquals(res.alreadyAssigned, true);
});

Deno.test("la RPC sin dato no se considera éxito", async () => {
  const mock = buildSupabaseMock({
    rpcs: { assign_stamped_rep_number: { data: null, error: null } },
  });
  const res = await assignRepFolio(mock.client as SupabaseLike, {
    paymentId: PAY,
    organizationId: ORG_A,
    folio: 7,
  });
  assert(!res.ok);
  assertEquals(res.code, "failed");
});

Deno.test("mensaje pendiente: explica que el CFDI se conserva y no se re-timbra", () => {
  const msg = repFolioPendingMessage("colisión de folio.");
  assert(msg.includes("no se"));
  assert(msg.includes("timbra"));
  assert(msg.length <= 1000);
});
