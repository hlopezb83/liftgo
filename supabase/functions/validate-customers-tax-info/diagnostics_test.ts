import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTOR,
  ORG_A,
  taxDiagnosticsFixture,
  taxRequest,
} from "../_shared/test/taxDiagnosticsTestHelpers.ts";
import { handleValidateCustomers } from "./handler.ts";

Deno.test("cartera diagnóstico: consultas, resultados y guardado se conservan con identidad verificada", async () => {
  const baseline = taxDiagnosticsFixture();
  const observed = taxDiagnosticsFixture();
  const oldResponse = await handleValidateCustomers(
    taxRequest(),
    baseline.deps,
  );
  const response = await handleValidateCustomers(taxRequest(), {
    ...observed.deps,
    diagnostics: observed.diagnostics,
  });
  assertEquals(response.status, oldResponse.status);
  assertEquals(await response.json(), await oldResponse.json());
  assertEquals(observed.queries, baseline.queries);
  assertEquals(observed.fetchCalls(), 1);
  const updates = (fixture: typeof observed) =>
    fixture.state.updates.map((update) => ({
      ...update,
      patch: { ...update.patch, sat_validated_at: "<timestamp>" },
    }));
  assertEquals(updates(observed), updates(baseline));
  assertEquals(observed.identities, [
    { userId: ACTOR, role: "administrativo" },
    { userId: ACTOR, role: "administrativo", organizationId: ORG_A },
  ]);
  assertEquals(observed.captures, []);
});

Deno.test("cartera diagnóstico: PAC técnico dentro de lote 200 se informa sin cuerpo privado", async () => {
  const f = taxDiagnosticsFixture();
  const response = await handleValidateCustomers(taxRequest(), {
    ...f.deps,
    diagnostics: f.diagnostics,
    fetchImpl: () =>
      Promise.resolve(new Response("PRIVATE-PAC-BODY", { status: 503 })),
  });
  assertEquals(response.status, 200);
  const summary = await response.json();
  assertEquals(summary.processed, 1);
  assertEquals(summary.error, 1);
  assertEquals(f.captures.length, 1);
  assertEquals(f.captures[0].status, 502);
  assertEquals(
    (f.captures[0].error as Error).message,
    "PAC validation request failed",
  );
});

Deno.test("cartera diagnóstico: fallo del observador no impide guardar ni repite consulta PAC", async () => {
  const f = taxDiagnosticsFixture();
  const response = await handleValidateCustomers(taxRequest(), {
    ...f.deps,
    diagnostics: {
      identify: () => {
        throw new Error("observer failed");
      },
      capture: () => {
        throw new Error("observer failed");
      },
    },
  });
  assertEquals(response.status, 200);
  assertEquals(f.fetchCalls(), 1);
  assertEquals(f.state.updates.length, 1);
});

Deno.test("cartera diagnóstico: error de guardado entrega objeto original y conserva el 500", async () => {
  const error = { message: "PRIVATE-DB-DETAIL", code: "XX000" };
  const f = taxDiagnosticsFixture(ORG_A, { saveError: error });
  const response = await handleValidateCustomers(taxRequest(), {
    ...f.deps,
    diagnostics: f.diagnostics,
  });
  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "No se pudo guardar la validación fiscal",
  });
  assertEquals(f.fetchCalls(), 1);
  assertEquals(f.state.updates.length, 1);
  assertEquals(f.captures.length, 1);
  assertStrictEquals(f.captures[0].error, error);
  assertEquals(f.captures[0].status, 500);
});
