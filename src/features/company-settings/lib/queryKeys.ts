import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

const sel = (s: string): string => s;

const COMPANY_SETTINGS_COLUMNS = sel(
  "id, rfc, razon_social, regimen_fiscal, lugar_expedicion, logo_url, created_at, updated_at, facturapi_mode, cxp_approval_threshold_mxn, cash_initial_balance, cash_safety_buffer, allow_e2e_seed"
);

/** Fila cruda de company_settings (datos fiscales completos). */
export const companySettingsQueries = defineEntityQueries(
  "company_settings",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select(COMPANY_SETTINGS_COLUMNS)
        .limit(1)
        .maybeSingle()
        .returns<Tables<"company_settings">>();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  },
);

export interface CxpApprovalThreshold {
  id: string | null;
  threshold: number;
}

export const cxpApprovalThresholdQueries = defineEntityQueries("cxp_approval_threshold", {
  list: () => async (): Promise<CxpApprovalThreshold> => {
    const { data, error } = await supabase
      .from("company_settings")
      .select("id, cxp_approval_threshold_mxn")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return {
      id: data?.id ?? null,
      threshold: Number(data?.cxp_approval_threshold_mxn ?? 10000),
    };
  },
  staleTime: 5 * 60_000,
});

type PublicBrandingRow = { logo_url: string | null; razon_social: string | null };

export const publicBrandingQueries = defineEntityQueries("public_branding", {
  list: () => async () => {
    const data = await callRpc<PublicBrandingRow[] | null>("get_public_branding");
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
 * v7.226.0 · E2E-N5: `public_branding` cachea 10 min y se persiste en
 * localStorage (24h) — al guardar logo/razón social hay que invalidarlo o el
 * portal público y las pantallas de login siguen mostrando el branding viejo.
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

type BillingSecretsRow = { id: string | null; has_test_key: boolean | null; has_live_key: boolean | null };

export const billingSecretsQueries = defineEntityQueries("billing_secrets_status", {
  list: () => async (): Promise<BillingSecretsStatus> => {
    const data = await callRpc<BillingSecretsRow[] | null>("get_billing_secrets_status");
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return { id: null, has_test_key: false, has_live_key: false };
    return {
      id: row.id ?? null,
      has_test_key: !!row.has_test_key,
      has_live_key: !!row.has_live_key,
    };
  },
  staleTime: 5 * 60_000,
});
