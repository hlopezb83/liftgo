import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

const sel = (s: string): string => s;

const COMPANY_SETTINGS_COLUMNS = sel(
  "id, rfc, razon_social, regimen_fiscal, lugar_expedicion, created_at, updated_at, facturapi_mode, cxp_approval_threshold_mxn, cash_initial_balance, cash_safety_buffer, allow_e2e_seed, maintenance_buffer_days",
);

/**
 * Multi-organización (tramo 3): `company_settings` está aislada por RLS a la
 * organización de la sesión verificada. Aun así NO tomamos "la primera" fila:
 * pedimos 2 y tratamos la duplicidad como error explícito, para que nunca se
 * muestren datos fiscales elegidos arbitrariamente.
 */
export class AmbiguousCompanySettingsError extends Error {
  constructor() {
    super(
      "Tu empresa tiene datos fiscales duplicados; corrígelos antes de continuar.",
    );
    this.name = "AmbiguousCompanySettingsError";
  }
}

async function fetchSingleCompanySettings<T>(
  columns: string,
): Promise<T | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select(columns)
    .limit(2)
    .returns<T[]>();
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length > 1) throw new AmbiguousCompanySettingsError();
  return rows[0] ?? null;
}

/** Fila cruda de company_settings (datos fiscales completos). */
export const companySettingsQueries = defineEntityQueries("company_settings", {
  list: () => async () =>
    fetchSingleCompanySettings<Tables<"company_settings">>(
      COMPANY_SETTINGS_COLUMNS,
    ),
  staleTime: 5 * 60_000,
});

export interface CxpApprovalThreshold {
  id: string | null;
  threshold: number;
}

export const cxpApprovalThresholdQueries = defineEntityQueries(
  "cxp_approval_threshold",
  {
    list: () => async (): Promise<CxpApprovalThreshold> => {
      const row = await fetchSingleCompanySettings<{
        id: string | null;
        cxp_approval_threshold_mxn: number | null;
      }>("id, cxp_approval_threshold_mxn");
      return {
        id: row?.id ?? null,
        threshold: Number(row?.cxp_approval_threshold_mxn ?? 10000),
      };
    },
    staleTime: 5 * 60_000,
  },
);

/**
 * Identidad legal mínima expuesta públicamente: sólo razón social. No incluye
 * logo, porque el logo de LiftGo es global y fijo para todas las
 * organizaciones (asset local del repositorio).
 */
type PublicBrandingRow = {
  razon_social: string | null;
};

export const publicBrandingQueries = defineEntityQueries("public_branding", {
  list: () => async () => {
    const data = await callRpc<PublicBrandingRow[] | null>(
      "get_public_branding",
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  },
  staleTime: 10 * 60_000,
});

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
  companySettingsQueries.keys.all,
  cxpApprovalThresholdQueries.keys.all,
  ["cash_flow_settings"] as const,
  ["company_settings"] as const,
  publicBrandingQueries.keys.all,
] as const;

export interface BillingSecretsStatus {
  id: string | null;
  has_test_key: boolean;
  has_live_key: boolean;
}

type BillingSecretsRow = {
  id: string | null;
  has_test_key: boolean | null;
  has_live_key: boolean | null;
};

export const billingSecretsQueries = defineEntityQueries(
  "billing_secrets_status",
  {
    list: () => async (): Promise<BillingSecretsStatus> => {
      const data = await callRpc<BillingSecretsRow[] | null>(
        "get_billing_secrets_status",
      );
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) return { id: null, has_test_key: false, has_live_key: false };
      return {
        id: row.id ?? null,
        has_test_key: !!row.has_test_key,
        has_live_key: !!row.has_live_key,
      };
    },
    staleTime: 5 * 60_000,
  },
);
