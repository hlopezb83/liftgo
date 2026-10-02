import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../test/supabaseClientMock.ts";
import { type FacturapiMode, loadFacturapiConfigOutcome } from "./client.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const invalidKeys: Array<[FacturapiMode, string]> = [
  ["test", "sk_live_wrong_environment"],
  ["live", "sk_test_wrong_environment"],
  ["test", "sk_user_account_scope"],
  ["live", "sk_user_account_scope"],
  ["test", "sk_test_"],
  ["live", "sk_live_"],
  ["test", " sk_test_x"],
  ["live", "unknown_key_format"],
];

for (const [mode, key] of invalidKeys) {
  Deno.test(`llave incompatible en BD: ${mode} / ${key}`, async () => {
    const mock = buildSupabaseMock({
      selects: {
        company_settings: { data: { facturapi_mode: mode }, error: null },
        billing_secrets: {
          data: {
            facturapi_test_key: mode === "test" ? key : null,
            facturapi_live_key: mode === "live" ? key : null,
          },
          error: null,
        },
      },
    });
    const outcome = await loadFacturapiConfigOutcome({
      admin: mock.client,
      organizationId: ORG,
      env: () => {
        throw new Error("Una llave inválida no debe activar fallback");
      },
    });
    assertEquals(outcome.ok, false);
    if (outcome.ok) throw new Error("Se devolvió una llave incompatible");
    assertEquals(outcome.status, 400);
    assertEquals(outcome.code, "config_invalid_key_mode");
    assertEquals(JSON.stringify(outcome).includes(key), false);
  });
}

for (const mode of ["test", "live"] as const) {
  Deno.test(`fallback legado también rechaza ambiente opuesto: ${mode}`, async () => {
    const mock = buildSupabaseMock({
      selects: {
        company_settings: { data: { facturapi_mode: mode }, error: null },
        billing_secrets: { data: null, error: null },
        organizations: { data: [{ id: ORG }], error: null },
      },
    });
    const oppositeKey = mode === "test" ? "sk_live_wrong" : "sk_test_wrong";
    const outcome = await loadFacturapiConfigOutcome({
      admin: mock.client,
      organizationId: ORG,
      env: () => oppositeKey,
    });
    assertEquals(outcome.ok, false);
    if (outcome.ok) throw new Error("Se devolvió una llave incompatible");
    assertEquals(outcome.status, 400);
    assertEquals(outcome.code, "config_invalid_key_mode");
    assertEquals(JSON.stringify(outcome).includes(oppositeKey), false);
  });
}
