/**
 * Contratos públicos de la operación de plataforma (alta/suspensión de
 * empresas). Extraído de `platformAdmin.functions.ts` sin cambios de forma:
 * lo consumen tanto los server functions como la UI de plataforma.
 */
export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  internal_members: number;
  portal_accounts: number;
  customers: number;
  /** Razón social fiscal (company_settings); `null` si no hay datos fiscales. */
  razon_social: string | null;
}

export interface PlatformOperatorStatus {
  isOperator: boolean;
}

export type {
  PlatformOnboardingInput as CreateOrganizationInput,
  CompletedOnboarding as CreateOrganizationResult,
} from "./platformOnboarding.types";

export interface SetOrganizationActiveInput {
  organization_id: string;
  active: boolean;
  reason: string;
}
