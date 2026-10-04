/**
 * Arranque del gate A/B: guard fail-closed + seed del entorno efímero.
 * Cualquier fallo aquí aborta la suite completa (no hay skips).
 */

import { assertLocalEphemeralBackend } from "./fixtures/localBackend";
import { seedAbEnvironment } from "./fixtures/abSeed";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildStorageState, signInViaApi } from "../e2e/fixtures/apiAuth";
import { createLocalUserClient } from "./fixtures/localBackend";

export default async function globalSetup(): Promise<void> {
  assertLocalEphemeralBackend("global.setup");
  const ctx = await seedAbEnvironment();
  const admin = await createLocalUserClient("staff setup", ctx.A.internal.email, ctx.A.internal.password);
  const settings = await admin.from("company_settings").insert({
    organization_id: ctx.A.organizationId, allow_e2e_seed: true,
    razon_social: ctx.A.organizationName, rfc: "XAXX010101000",
    regimen_fiscal: "601", lugar_expedicion: "64000", facturapi_mode: "test",
  }).select("id").single();
  if (settings.error || !settings.data) throw new Error("[ab-gate] settings locales: " + settings.error?.message);
  process.env.E2E_TEST_EMAIL = ctx.A.internal.email;
  process.env.E2E_TEST_PASSWORD = ctx.A.internal.password;
  for (const [role, user] of Object.entries(ctx.roles)) {
    process.env["E2E_" + role.toUpperCase() + "_EMAIL"] = user.email;
    process.env["E2E_" + role.toUpperCase() + "_PASSWORD"] = user.password;
  }
  const session = await signInViaApi(ctx.A.internal.email, ctx.A.internal.password);
  mkdirSync("tests/multi-tenant-ab/.state", { recursive: true });
  writeFileSync("tests/multi-tenant-ab/.state/internal-a.json",
    JSON.stringify(buildStorageState(session, process.env.E2E_BASE_URL ?? "http://localhost:4173")),
    { mode: 0o600 });
}
