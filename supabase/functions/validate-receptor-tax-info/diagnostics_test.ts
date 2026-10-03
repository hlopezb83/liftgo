import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTOR,
  INVOICE,
  ORG_A,
  ORG_B,
  taxDiagnosticsFixture,
  taxRequest,
} from "../_shared/test/taxDiagnosticsTestHelpers.ts";
import { handleValidateReceptor } from "./handler.ts";

Deno.test("receptor diagnóstico: identidad de BD y consultas/respuesta iguales con observador", async () => {
  const baseline = taxDiagnosticsFixture();
  const observed = taxDiagnosticsFixture();
  const oldResponse = await handleValidateReceptor(
    taxRequest({ invoice_id: INVOICE }),
    baseline.deps,
  );
  const response = await handleValidateReceptor(
    taxRequest({ invoice_id: INVOICE }),
    { ...observed.deps, diagnostics: observed.diagnostics },
  );
  assertEquals(response.status, oldResponse.status);
  assertEquals(await response.json(), await oldResponse.json());
  assertEquals(observed.queries, baseline.queries);
  assertEquals(observed.fetchCalls(), 1);
  assertEquals(observed.identities, [
    { userId: ACTOR, role: "administrativo" },
    { userId: ACTOR, role: "administrativo", organizationId: ORG_A },
  ]);
  assertEquals(observed.captures, []);
});

Deno.test("receptor diagnóstico: factura ajena no atribuye empresa ni consulta secretos", async () => {
  const f = taxDiagnosticsFixture(ORG_B);
  const response = await handleValidateReceptor(
    taxRequest({ invoice_id: INVOICE }),
    { ...f.deps, diagnostics: f.diagnostics },
  );
  assertEquals(response.status, 403);
  assertEquals(f.identities, [{ userId: ACTOR, role: "administrativo" }]);
  assertEquals(f.queries.includes("billing_secrets"), false);
  assertEquals(f.fetchCalls(), 0);
  assertEquals(f.captures, []);
});

Deno.test("receptor diagnóstico: PAC 503 conserva 502 y no pasa el cuerpo al observador", async () => {
  const f = taxDiagnosticsFixture();
  const response = await handleValidateReceptor(
    taxRequest({ invoice_id: INVOICE }),
    {
      ...f.deps,
      diagnostics: f.diagnostics,
      fetchImpl: () =>
        Promise.resolve(new Response("PRIVATE-PAC-BODY", { status: 503 })),
    },
  );
  assertEquals(response.status, 502);
  assertEquals((await response.json()).detail, "PRIVATE-PAC-BODY");
  assertEquals(f.captures.length, 1);
  assertEquals(f.captures[0].status, 502);
  assertEquals(
    (f.captures[0].error as Error).message,
    "PAC validation request failed",
  );
});

Deno.test("receptor diagnóstico: transporte original y observador fallido conservan un solo 500", async () => {
  const error = new TypeError("PRIVATE-TRANSPORT-DETAIL");
  const f = taxDiagnosticsFixture();
  let fetchCalls = 0;
  let capturedError: unknown;
  let capturedStatus: number | undefined;
  const response = await handleValidateReceptor(
    taxRequest({ invoice_id: INVOICE }),
    {
      ...f.deps,
      fetchImpl: () => {
        fetchCalls++;
        return Promise.reject(error);
      },
      diagnostics: {
        identify: () => {
          throw new Error("observer failed");
        },
        capture: (captured, status) => {
          capturedError = captured;
          capturedStatus = status;
          throw new Error("observer failed");
        },
      },
    },
  );
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "Internal server error" });
  assertEquals(fetchCalls, 1);
  assertStrictEquals(capturedError, error);
  assertEquals(capturedStatus, 500);
});
