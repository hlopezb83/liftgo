/**
 * Cierre del gate A/B. El entorno es efímero (el job destruye el Supabase
 * local con `if: always()`), pero se borra lo sembrado para que la suite sea
 * repetible en local y no deje objetos de Storage colgados.
 */

import { existsSync, rmSync } from "node:fs";
import { AB_BUCKET, AB_LEGACY_OBJECT } from "./fixtures/abIdentities";
import { AB_CONTEXT_FILE, readAbContext } from "./fixtures/abSeed";
import { createLocalAdminClient } from "./fixtures/localBackend";

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(AB_CONTEXT_FILE)) return;
  const ctx = readAbContext();
  const admin = createLocalAdminClient("global.teardown");

  await admin.storage
    .from(AB_BUCKET)
    .remove([ctx.A.storagePath, ctx.B.storagePath, AB_LEGACY_OBJECT]);

  for (const side of [ctx.A, ctx.B]) {
    await admin.from("documents").delete().eq("id", side.documentId);
    await admin.from("invoices").delete().eq("id", side.invoiceId);
    await admin.from("customer_portal_accounts").delete().eq("organization_id", side.organizationId);
    await admin.from("organization_memberships").delete().eq("organization_id", side.organizationId);
    for (const userId of [side.internal.userId, side.portal.userId]) {
      await admin.auth.admin.deleteUser(userId);
    }
    await admin.from("organization_customers").delete().eq("organization_id", side.organizationId);
    await admin.from("customers").delete().eq("id", side.customerId);
    await admin.from("organizations").delete().eq("id", side.organizationId);
  }

  // El operador sintético debe seguir existiendo durante la restauración: es
  // la única vía oficial para reactivar las empresas iniciales que el seed
  // suspendió. En CI el `supabase stop` sigue siendo la red final.
  for (const organizationId of ctx.initialActiveOrganizationIds ?? []) {
    await admin.rpc("platform_set_organization_active", {
      p_actor: ctx.platformOperatorUserId,
      p_organization_id: organizationId,
      p_active: true,
    });
  }

  await admin.from("platform_operators").delete().eq("auth_user_id", ctx.platformOperatorUserId);
  await admin.auth.admin.deleteUser(ctx.platformOperatorUserId);

  rmSync(AB_CONTEXT_FILE, { force: true });
}
