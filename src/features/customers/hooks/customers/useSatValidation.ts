/**
 * Validación masiva de la cartera contra la Constancia de Situación Fiscal
 * del SAT (vía el PAC, sin consumir timbre).
 *
 * `useSatValidationOverview` lee el estado guardado en `customers`;
 * `useValidateCustomersTaxInfo` dispara la corrida por lotes en la edge
 * function `validate-customers-tax-info`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { customerKeys } from "../../lib/queryKeys";

export type SatValidationStatus = "not_validated" | "valid" | "mismatch" | "error";

export interface SatValidationError {
  path?: string;
  message?: string;
  code?: string;
}

export interface SatValidationRow {
  id: string;
  name: string;
  razon_social: string | null;
  rfc: string | null;
  sat_validation_status: SatValidationStatus;
  sat_validated_at: string | null;
  sat_validation_errors: SatValidationError[];
}

export interface ValidateCustomersSummary {
  processed: number;
  valid: number;
  mismatch: number;
  error: number;
  remaining: number;
  results: Array<{
    customer_id: string;
    name: string;
    status: "valid" | "mismatch" | "error";
    errors: SatValidationError[];
  }>;
}

const RFC_PUBLICO_GENERAL = "XAXX010101000";

export const satValidationKey = [...customerKeys.all, "sat-validation"] as const;

export function useSatValidationOverview() {
  return useQuery({
    queryKey: satValidationKey,
    queryFn: async (): Promise<SatValidationRow[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, razon_social, rfc, sat_validation_status, sat_validated_at, sat_validation_errors",
        )
        .is("deleted_at", null)
        .not("rfc", "is", null)
        .neq("rfc", "")
        .neq("rfc", RFC_PUBLICO_GENERAL)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        razon_social: row.razon_social,
        rfc: row.rfc,
        sat_validation_status: (row.sat_validation_status ??
          "not_validated") as SatValidationStatus,
        sat_validated_at: row.sat_validated_at,
        sat_validation_errors: Array.isArray(row.sat_validation_errors)
          ? (row.sat_validation_errors as SatValidationError[])
          : [],
      }));
    },
  });
}

export function useValidateCustomersTaxInfo() {
  return useEntityMutation({
    mutationFn: async (input: { limit?: number; onlyPending?: boolean } = {}) =>
      await invokeEdgeFunction<ValidateCustomersSummary>(
        "validate-customers-tax-info",
        {
          body: {
            limit: input.limit ?? 40,
            only_pending: input.onlyPending ?? false,
          },
        },
      ),
    invalidateKeys: [satValidationKey, customerKeys.all],
    errorTitle: "Error al validar la cartera contra el SAT",
  });
}
