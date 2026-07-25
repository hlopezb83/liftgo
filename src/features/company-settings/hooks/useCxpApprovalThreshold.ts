import { useMemo } from "react";
import { COMPANY_SETTINGS_INVALIDATION_KEYS, type CxpApprovalThreshold } from "../lib/queryKeys";
import { useCompanySettings } from "./useCompanySettings";

/**
 * Tanda 3 P3-10.1: la fila de `company_settings` es un singleton. En vez de
 * mantener 3 queries paralelas (companySettings + cxpApprovalThreshold +
 * cashFlowSettings) que descargan la misma fila, derivamos aquí desde
 * `useCompanySettings()`. Sin cambios en la API pública: mismo shape,
 * mismo loading/error, mismo objeto memoizado.
 */


const DEFAULT_THRESHOLD = 10_000;

export function useCxpApprovalThreshold() {
  const q = useCompanySettings();
  const data: CxpApprovalThreshold | undefined = useMemo(() => {
    if (!q.data) return q.isSuccess ? { id: null, threshold: DEFAULT_THRESHOLD } : undefined;
    return {
      id: q.data.id ?? null,
      threshold: Number(q.data.cxp_approval_threshold_mxn ?? DEFAULT_THRESHOLD),
    };
  }, [q.data, q.isSuccess]);
  return { ...q, data } as typeof q & { data: CxpApprovalThreshold | undefined };
}

export function useUpdateCxpApprovalThreshold() {
  return useEntityMutation({
    mutationFn: async ({ id, threshold }: { id: string | null; threshold: number }) => {
      if (!id) {
        throw new Error(
          "Primero captura los Datos Fiscales para crear la configuración base de la empresa.",
        );
      }
      const { error } = await supabase
        .from("company_settings")
        .update({ cxp_approval_threshold_mxn: threshold })
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: COMPANY_SETTINGS_INVALIDATION_KEYS,
    successMsg: "Umbral de aprobación actualizado",
    errorTitle: "No se pudo actualizar el umbral",
  });
}
