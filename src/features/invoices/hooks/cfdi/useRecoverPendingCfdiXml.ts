import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { fetchCfdiBlob } from "../../lib/downloadCfdiBlob";
import { invoiceKeys } from "../../lib/queryKeys";

export function useRecoverPendingCfdiXml() {
  return useEntityMutation<string, Blob>({
    mutationFn: (invoiceId: string) => fetchCfdiBlob({ invoice_id: invoiceId }, "xml"),
    retry: false,
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_blob, invoiceId) => [invoiceKeys.detail(invoiceId)],
    errorTitle: "No se pudo recuperar el XML desde Facturapi",
    onSuccess: () => {
      notifySuccess("XML recuperado", {
        description: "El CFDI XML ya quedó adjunto a la factura.",
      });
    },
  });
}
