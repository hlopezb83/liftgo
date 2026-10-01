import type { PlatformAuditEvent } from "@/lib/platformAudit.types";
import type { PlatformOrganizationDetail } from "@/lib/platformOrganizationDetail.types";

export const ORG_ID = "88000000-0000-4000-8000-000000000001";
export const ACTOR_ID = "88000000-0000-4000-8000-000000000002";

export function organizationDetail(): PlatformOrganizationDetail {
  return {
    organization: {
      id: ORG_ID,
      name: "Empresa Norte",
      slug: "empresa-norte",
      is_active: true,
      created_at: "2026-10-01T12:00:00Z",
    },
    can_suspend: true,
    settings: {
      records: 1,
      razon_social: "Empresa Norte SA de CV",
      rfc: "ENO010101AB1",
      regimen_fiscal: "601",
      postal_code: "64000",
      maintenance_buffer_days: 1,
      updated_at: "2026-10-01T12:00:00Z",
    },
    billing: { mode: "test", key_configured: true },
    administrators: [
      {
        user_id: ACTOR_ID,
        full_name: "Administradora Norte",
        email: "admin.norte@example.com",
        is_active: true,
      },
    ],
    catalogs: {
      models_enabled: 1,
      global_models_enabled: 1,
      parts_enabled: 0,
      global_parts_enabled: 0,
    },
    templates: [
      {
        definition_id: ORG_ID,
        name: "Contrato de renta",
        document_type: "rental_contract",
        version_id: ACTOR_ID,
        version: 1,
        is_active: true,
        is_current: false,
      },
    ],
    active_bank_accounts: 0,
    counters: [],
    checked_at: "2026-10-01T12:00:00Z",
  };
}

export function auditEvent(id = "9007199254740993"): PlatformAuditEvent {
  return {
    id,
    occurred_at: "2026-10-01T12:00:00Z",
    actor_id: ACTOR_ID,
    actor_name: "Operador Norte",
    organization_id: ORG_ID,
    target_type: "organizations",
    target_id: ORG_ID,
    action: "UPDATE",
    reason: "Reactivación solicitada por administración",
    request_id: ACTOR_ID,
    changed_fields: ["is_active"],
    old_state: { is_active: false },
    new_state: { is_active: true },
    is_legacy: false,
  };
}
