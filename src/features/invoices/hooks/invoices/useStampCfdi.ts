import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: (err: unknown) => {
      notifyError({ error: err, message: "Error al timbrar" });
    },
  });
}
