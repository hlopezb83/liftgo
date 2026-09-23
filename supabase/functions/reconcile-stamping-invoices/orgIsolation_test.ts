// Multiempresa · Fase 1 — regresión: aislamiento fiscal entre organizaciones
// en el cron de reconciliación. No levanta el server completo (Deno.serve);
// ejercita los mismos bloques compartidos que usa index.ts para procesar
// cada organización (groupByOrganization + getFacturapiConfigForOrganization)
// contra dos empresas ficticias.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { getFacturapiConfigForOrganization } from "../_shared/facturapi/client.ts";
import { groupByOrganization } from "../_shared/orgContext.ts";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

Deno.test("groupByOrganization: separa filas atoradas por empresa y aísla las sin organización", () => {
  const rows = [
    { id: "inv-a1", organization_id: ORG_A },
    { id: "inv-b1", organization_id: ORG_B },
    { id: "inv-huerfana", organization_id: null },
  ];
  const { groups, withoutOrganization } = groupByOrganization(rows);
  assertEquals(groups.get(ORG_A)?.map((r) => r.id), ["inv-a1"]);
  assertEquals(groups.get(ORG_B)?.map((r) => r.id), ["inv-b1"]);
  assertEquals(withoutOrganization.map((r) => r.id), ["inv-huerfana"]);
});

Deno.test("dos empresas: cada una resuelve SU PROPIA llave/modo (nunca la de la otra)", async () => {
  const mock = buildSupabaseMock({
    selectsSeq: {
      company_settings: [
        { data: { facturapi_mode: "live" }, error: null }, // org A
        { data: { facturapi_mode: "test" }, error: null }, // org B
      ],
      billing_secrets: [
        {
          data: { facturapi_test_key: null, facturapi_live_key: "sk_live_A" },
          error: null,
        },
        { data: null, error: null }, // llave live de A sin otra organización
        {
          data: { facturapi_test_key: "sk_test_B", facturapi_live_key: null },
          error: null,
        },
        { data: null, error: null }, // llave test de B sin otra organización
      ],
    },
  });

  const cfgA = await getFacturapiConfigForOrganization({
    admin: mock.client as unknown as { from: (t: string) => unknown } as never,
    env: () => undefined,
    organizationId: ORG_A,
  });
  const cfgB = await getFacturapiConfigForOrganization({
    admin: mock.client as unknown as { from: (t: string) => unknown } as never,
    env: () => undefined,
    organizationId: ORG_B,
  });

  assertEquals(cfgA, {
    mode: "live",
    apiKey: "sk_live_A",
    organizationId: ORG_A,
    fromEnvFallback: false,
  });
  assertEquals(cfgB, {
    mode: "test",
    apiKey: "sk_test_B",
    organizationId: ORG_B,
    fromEnvFallback: false,
  });
  // Ninguna llave se filtró a la otra empresa.
  assertEquals(cfgA.apiKey !== cfgB.apiKey, true);
});

Deno.test("empresa sin credenciales: reporta config faltante sin usar llaves de otra empresa", async () => {
  const mock = buildSupabaseMock({
    // Ambas orgs consultan las MISMAS tablas mock; sin secretos configurados
    // (ninguna key en BD) y sin fallback de entorno (hay > 1 organización)
    // el resultado debe ser apiKey null para la empresa sin config.
    selects: {
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: {
        data: { facturapi_test_key: null, facturapi_live_key: null },
        error: null,
      },
      organizations: {
        data: [{ id: ORG_A }, { id: ORG_B }],
        error: null,
      },
    },
  });

  const cfgB = await getFacturapiConfigForOrganization({
    admin: mock.client as unknown as { from: (t: string) => unknown } as never,
    env: () => undefined,
    organizationId: ORG_B,
  });

  assertEquals(cfgB.apiKey, null);
  assertEquals(cfgB.organizationId, ORG_B);
});
