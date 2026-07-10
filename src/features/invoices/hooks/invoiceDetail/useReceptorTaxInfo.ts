import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invoiceKeys } from "../../lib/queryKeys";

export interface ReceptorValidationResult {
  is_valid: boolean;
  errors: Array<{ path: string; message: string; code?: string }>;
  sent: {
    tax_id: string;
    legal_name: string;
    tax_system: string;
    zip: string;
  };
  note?: string;
}

/**
 * Consulta a Facturapi si el snapshot fiscal del receptor de la factura
 * coincide con la Constancia de Situación Fiscal registrada en el SAT.
 * No consume timbre.
 */
export function useValidateReceptorTaxInfo() {
  return useEntityMutation({
    mutationFn: async (invoiceId: string): Promise<ReceptorValidationResult> => {
      return await invokeEdgeFunction<ReceptorValidationResult>(
        "validate-receptor-tax-info",
        { body: { invoice_id: invoiceId } },
      );
    },
    errorTitle: "Error al validar datos fiscales",
  });
}

interface UpdateReceptorInput {
  invoiceId: string;
  customerId: string | null;
  syncCustomer: boolean;
  patch: {
    receptor_razon_social: string;
    receptor_regimen_fiscal: string;
    receptor_domicilio_fiscal_cp: string;
  };
}

/**
 * Actualiza el snapshot fiscal del receptor en la factura y, opcionalmente,
 * sincroniza los mismos valores en el cliente.
 */
export function useUpdateReceptorFiscalInfo() {
  return useEntityMutation({
    mutationFn: async (input: UpdateReceptorInput) => {
      const { error } = await supabase
        .from("invoices")
        .update(input.patch)
        .eq("id", input.invoiceId);
      if (error) throw error;
      if (input.syncCustomer && input.customerId) {
        const { error: cErr } = await supabase
          .from("customers")
          .update({
            razon_social: input.patch.receptor_razon_social,
            regimen_fiscal: input.patch.receptor_regimen_fiscal,
            domicilio_fiscal_cp: input.patch.receptor_domicilio_fiscal_cp,
          })
          .eq("id", input.customerId);
        if (cErr) throw cErr;
      }
      return input;
    },
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_d, vars) => [
      invoiceKeys.detail(vars.invoiceId),
      ...(vars.customerId ? [["customers"] as const] : []),
    ],
    errorTitle: "Error al actualizar datos fiscales",
  });
}
