import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { downloadPaymentsXlsx } from "../lib/buildPaymentsXlsx";
import { paymentBatchExportRows, paymentBatchSnapshotSchema } from "../lib/paymentBatchSnapshot";

export async function downloadPaymentBatch(batchId: string): Promise<string> {
  const snapshot = paymentBatchSnapshotSchema.parse(
    await callRpc<unknown>("get_supplier_payment_batch_snapshot", { p_batch_id: batchId }),
  );
  if (snapshot.id !== batchId) throw new Error("El lote recibido no corresponde a la descarga.");
  return downloadPaymentsXlsx(paymentBatchExportRows(snapshot), snapshot.id);
}

export function useDownloadPaymentBatch() {
  return useEntityMutation({
    mutationFn: downloadPaymentBatch,
    successMsg: "Layout del lote descargado",
    errorTitle: "No se pudo descargar el lote",
    errorMessage: "El lote sigue guardado. Reintenta la descarga desde el historial.",
  });
}

