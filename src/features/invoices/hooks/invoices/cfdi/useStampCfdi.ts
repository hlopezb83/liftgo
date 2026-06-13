import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateFacturapiError } from "../../../lib/facturapiErrors";

import { invoiceKeys } from "../../../lib/queryKeys";

interface StampCfdiResponse {
  cfdi_uuid: string;
  stub?: boolean;
  error?: string;
}

/**
 * Timbra una factura ante el PAC (Facturapi) vía edge function `stamp-cfdi`.
 */
export function useStampCfdi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string): Promise<StampCfdiResponse> => {
      const { data, error } = await supabase.functions.invoke("stamp-cfdi", {
        body: { invoice_id: invoiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as StampCfdiResponse;
    },
    onSuccess: (data, invoiceId) => {
      toast.success(
        `CFDI timbrado${data.stub ? " (modo prueba)" : " exitosamente"} — UUID: ${data.cfdi_uuid}`,
      );
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      notifyError({ error: err, message: translateFacturapiError(raw) });
    },
  });
}
