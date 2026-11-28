import { createEntityKeys } from "@/lib/query/createEntityKeys";

export interface CxpApprovalThreshold {
  id: string | null;
  threshold: number;
}

export interface BillingSecretsStatus {
  id: string | null;
  has_test_key: boolean;
  has_live_key: boolean;
}

export const companySettingsKeys = createEntityKeys("company_settings");
const cxpApprovalThresholdKeys = createEntityKeys("cxp_approval_threshold");
const publicBrandingKeys = createEntityKeys("public_branding");
export const billingSecretsKeys = createEntityKeys("billing_secrets_status");

/**
 * v7.207.0 (DIFF 9c/d): la fila de `company_settings` alimenta tres caches
 * paralelas (companySettings, cxpApprovalThreshold, cashFlowSettings).
 * Cualquier mutación sobre esa fila debe invalidar las tres. El prefijo
 * `["company_settings"]` sirve como catch-all para lecturas ad-hoc que aún
 * no han sido migradas al factory.
 *
 * `public_branding` cachea 10 min y se persiste en localStorage (24h) — al
 * guardar la razón social hay que invalidarlo o el portal público y las
 * pantallas de acceso siguen mostrando la identidad legal vieja.
 */
export const COMPANY_SETTINGS_INVALIDATION_KEYS = [
  companySettingsKeys.all,
  cxpApprovalThresholdKeys.all,
  ["cash_flow_settings"] as const,
  ["company_settings"] as const,
  publicBrandingKeys.all,
  ["sidebar-organization-name"] as const,
] as const;
