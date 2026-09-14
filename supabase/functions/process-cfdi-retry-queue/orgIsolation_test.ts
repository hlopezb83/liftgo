// Multiempresa · Fase 1: la cola de reintentos de CFDI nunca debe aceptar la
// empresa que venga en el payload del elemento encolado; la organización sale
// exclusivamente de la fila de la factura leída en BD.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyInvoiceReadOutcome,
  resolveStampRetryOrganization,
} from "./decisions.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("retry-queue: la organización sale de la factura en BD, no del payload", () => {
  // El payload de la cola dice ORG_B; la factura real pertenece a ORG_A.
  const payload = { organization_id: ORG_B, invoice_id: "inv-1" };
  const invoiceRow = { organization_id: ORG_A };

  const outcome = resolveStampRetryOrganization(invoiceRow);

  assertEquals(outcome, { kind: "ok", organizationId: ORG_A });
  // La firma sólo admite la fila de BD: el payload no es un parámetro posible.
  assertEquals(payload.organization_id, ORG_B);
});

Deno.test("retry-queue: factura sin organización → no hay empresa resoluble", () => {
  assertEquals(resolveStampRetryOrganization({ organization_id: null }), {
    kind: "no_organization",
  });
  assertEquals(resolveStampRetryOrganization({}), { kind: "no_organization" });
  assertEquals(resolveStampRetryOrganization(null), {
    kind: "no_organization",
  });
});

Deno.test("retry-queue: dos empresas distintas resuelven credenciales distintas", () => {
  assertEquals(
    resolveStampRetryOrganization({ organization_id: ORG_A }),
    { kind: "ok", organizationId: ORG_A },
  );
  assertEquals(
    resolveStampRetryOrganization({ organization_id: ORG_B }),
    { kind: "ok", organizationId: ORG_B },
  );
});

// 8.8.7 · Fallo TRANSITORIO de lectura vs factura realmente sin empresa.
Deno.test("retry-queue: error transitorio de BD se DIFIERE (no agota ni llama al PAC)", () => {
  assertEquals(
    classifyInvoiceReadOutcome({ message: "db down" }, null),
    { kind: "deferred" },
  );
  // Incluso con una fila válida, el error manda: no se confía en data.
  assertEquals(
    classifyInvoiceReadOutcome({ message: "timeout" }, {
      organization_id: ORG_A,
    }),
    { kind: "deferred" },
  );
});

Deno.test("retry-queue: sin error y sin organización sigue siendo rechazo definitivo", () => {
  assertEquals(classifyInvoiceReadOutcome(null, null), {
    kind: "no_organization",
  });
  assertEquals(classifyInvoiceReadOutcome(null, { organization_id: null }), {
    kind: "no_organization",
  });
});

Deno.test("retry-queue: lectura correcta resuelve la empresa de la factura", () => {
  assertEquals(classifyInvoiceReadOutcome(null, { organization_id: ORG_B }), {
    kind: "ok",
    organizationId: ORG_B,
  });
});
