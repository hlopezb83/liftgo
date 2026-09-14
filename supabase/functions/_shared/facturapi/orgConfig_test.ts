import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type FacturapiConfigError,
  getFacturapiConfigForOrganization,
  isFacturapiConfigError,
  isSoleLegacyOrganization,
  loadFacturapiConfigOutcome,
} from "./client.ts";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

interface Rows {
  company_settings: Array<Record<string, unknown>>;
  billing_secrets: Array<Record<string, unknown>>;
  organizations: Array<{ id: string }>;
}

/**
 * Mock que respeta el filtro `.eq("organization_id", ...)`: si el helper
 * olvidara filtrar, el test devolvería la fila de otra empresa y fallaría.
 * `errors` permite simular fallos de lectura por tabla (8.8.7).
 */
function adminFor(
  rows: Rows,
  errors: Record<string, { message: string }> = {},
  // deno-lint-ignore no-explicit-any
): { from: (t: string) => any } {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const all = (rows as unknown as Record<string, unknown[]>)[table] ?? [];
      const err = errors[table] ?? null;
      const match = () =>
        all.filter((r) =>
          Object.entries(filters).every(([k, v]) =>
            (r as Record<string, unknown>)[k] === v
          )
        );
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        limit: (n: number) =>
          Promise.resolve(
            err
              ? { data: null, error: err }
              : { data: match().slice(0, n), error: null },
          ),
        maybeSingle: () =>
          Promise.resolve(
            err ? { data: null, error: err } : {
              data: match()[0] ?? null,
              error: null,
            },
          ),
      };
      return builder;
    },
  };
}

const envKeys = (k: string) =>
  ({ FACTURAPI_TEST_KEY: "env_test", FACTURAPI_LIVE_KEY: "env_live" })[k];

Deno.test("exige organización: sin ella lanza error explícito", async () => {
  await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin: adminFor({
        company_settings: [],
        billing_secrets: [],
        organizations: [],
      }),
      env: envKeys,
      organizationId: null,
    })
  );
});

Deno.test("cada empresa usa sus propias llaves y su propio modo", async () => {
  const admin = adminFor({
    company_settings: [
      { organization_id: ORG_A, facturapi_mode: "live" },
      { organization_id: ORG_B, facturapi_mode: "test" },
    ],
    billing_secrets: [
      {
        organization_id: ORG_A,
        facturapi_test_key: "a_test",
        facturapi_live_key: "a_live",
      },
      {
        organization_id: ORG_B,
        facturapi_test_key: "b_test",
        facturapi_live_key: "b_live",
      },
    ],
    organizations: [{ id: ORG_A }, { id: ORG_B }],
  });

  const a = await getFacturapiConfigForOrganization({
    admin,
    env: envKeys,
    organizationId: ORG_A,
  });
  assertEquals(a.mode, "live");
  assertEquals(a.apiKey, "a_live");

  const b = await getFacturapiConfigForOrganization({
    admin,
    env: envKeys,
    organizationId: ORG_B,
  });
  assertEquals(b.mode, "test");
  assertEquals(b.apiKey, "b_test");
});

Deno.test("empresa sin configuración NO reutiliza llaves de otra ni del entorno", async () => {
  const admin = adminFor({
    company_settings: [
      { organization_id: ORG_A, facturapi_mode: "live" },
      { organization_id: ORG_B, facturapi_mode: "live" },
    ],
    billing_secrets: [{
      organization_id: ORG_A,
      facturapi_test_key: "a_test",
      facturapi_live_key: "a_live",
    }],
    organizations: [{ id: ORG_A }, { id: ORG_B }],
  });
  const b = await getFacturapiConfigForOrganization({
    admin,
    env: envKeys,
    organizationId: ORG_B,
  });
  assertEquals(b.apiKey, null);
  assertEquals(b.fromEnvFallback, false);
});

Deno.test("8.8.7: empresa sin fila de company_settings ⇒ config_missing (no modo test)", async () => {
  const admin = adminFor({
    company_settings: [],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  });
  const err = await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin,
      env: envKeys,
      organizationId: ORG_A,
    })
  );
  assertEquals(isFacturapiConfigError(err), true);
  assertEquals((err as FacturapiConfigError).code, "config_missing");
});

Deno.test("8.8.7: modo inválido ⇒ config_invalid_mode", async () => {
  const admin = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "sandbox" }],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  });
  const err = await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin,
      env: envKeys,
      organizationId: ORG_A,
    })
  );
  assertEquals((err as FacturapiConfigError).code, "config_invalid_mode");
});

Deno.test("8.8.7: error al leer company_settings ⇒ config_read_error sin llave", async () => {
  const admin = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "live" }],
    billing_secrets: [{
      organization_id: ORG_A,
      facturapi_test_key: "a_test",
      facturapi_live_key: "a_live",
    }],
    organizations: [{ id: ORG_A }],
  }, { company_settings: { message: "db down" } });
  const err = await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin,
      env: envKeys,
      organizationId: ORG_A,
    })
  );
  assertEquals((err as FacturapiConfigError).code, "config_read_error");
});

Deno.test("8.8.7: error al leer billing_secrets ⇒ config_read_error, nunca entorno", async () => {
  const admin = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "test" }],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  }, { billing_secrets: { message: "db down" } });
  const err = await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin,
      env: envKeys,
      organizationId: ORG_A,
    })
  );
  assertEquals((err as FacturapiConfigError).code, "config_read_error");
});

Deno.test("8.8.7: loadFacturapiConfigOutcome traduce lectura fallida a 503", async () => {
  const admin = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "live" }],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  }, { company_settings: { message: "db down" } });
  const outcome = await loadFacturapiConfigOutcome({
    admin,
    env: envKeys,
    organizationId: ORG_A,
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.status, 503);
    assertEquals(outcome.code, "config_read_error");
  }
});

Deno.test("8.8.7: loadFacturapiConfigOutcome traduce config ausente a 400", async () => {
  const admin = adminFor({
    company_settings: [],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  });
  const outcome = await loadFacturapiConfigOutcome({
    admin,
    env: envKeys,
    organizationId: ORG_A,
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.status, 400);
});

Deno.test("8.8.7: modeOverride null se trata como configuración ausente", async () => {
  const admin = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "live" }],
    billing_secrets: [{
      organization_id: ORG_A,
      facturapi_test_key: "a_test",
      facturapi_live_key: "a_live",
    }],
    organizations: [{ id: ORG_A }],
  });
  const err = await assertRejects(() =>
    getFacturapiConfigForOrganization({
      admin,
      env: envKeys,
      organizationId: ORG_A,
      modeOverride: null,
    })
  );
  assertEquals((err as FacturapiConfigError).code, "config_missing");
});

Deno.test("fallback legado de entorno sólo con una única organización", async () => {
  const sola = adminFor({
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "test" }],
    billing_secrets: [],
    organizations: [{ id: ORG_A }],
  });
  const legacy = await getFacturapiConfigForOrganization({
    admin: sola,
    env: envKeys,
    organizationId: ORG_A,
  });
  assertEquals(legacy.apiKey, "env_test");
  assertEquals(legacy.fromEnvFallback, true);
});

Deno.test("isSoleLegacyOrganization es falso con dos empresas", async () => {
  const admin = adminFor({
    company_settings: [],
    billing_secrets: [],
    organizations: [{ id: ORG_A }, { id: ORG_B }],
  });
  assertEquals(await isSoleLegacyOrganization(admin, ORG_A), false);
});

Deno.test("modeOverride evita releer company_settings", async () => {
  const admin = adminFor({
    company_settings: [],
    billing_secrets: [{
      organization_id: ORG_A,
      facturapi_test_key: "a_test",
      facturapi_live_key: "a_live",
    }],
    organizations: [{ id: ORG_A }],
  });
  const cfg = await getFacturapiConfigForOrganization({
    admin,
    env: envKeys,
    organizationId: ORG_A,
    modeOverride: "live",
  });
  assertEquals(cfg.mode, "live");
  assertEquals(cfg.apiKey, "a_live");
});
