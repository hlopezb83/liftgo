// Multiempresa · alcance de la corrida de pólizas de mantenimiento.
//
//  · Cron válido / service_role → alcance GLOBAL (todas las organizaciones),
//    propagando siempre la organización de cada póliza.
//  · Persona autenticada (admin/administrativo) → alcance acotado a su
//    organización interna, resuelta desde `organization_memberships`.
//  · Fail-closed: sin membresía interna única no se procesa nada.

import {
  type OrgQueryClient,
  resolveCallerOrganization,
} from "../_shared/orgContext.ts";

export type MaintenanceScope =
  | { ok: true; organizationId: string | null; global: boolean }
  | { ok: false; status: number; message: string };

export async function resolveMaintenanceScope(input: {
  isCron: boolean;
  role: string | null;
  userId: string;
  admin: OrgQueryClient;
}): Promise<MaintenanceScope> {
  if (input.isCron || input.role === "service_role") {
    return { ok: true, organizationId: null, global: true };
  }
  const caller = await resolveCallerOrganization(input.admin, input.userId);
  if (!caller.ok) {
    return { ok: false, status: caller.status, message: caller.message };
  }
  return { ok: true, organizationId: caller.organizationId, global: false };
}
