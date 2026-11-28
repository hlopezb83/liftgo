import { useState } from "react";
import { toYMD } from "@/lib/date/toYMD";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { notifyWarning } from "@/lib/ui/appFeedback";
import { useRegisterSupplierPayment } from "./useRegisterSupplierPayment";
import { removeSupplierReceipt, useUploadSupplierReceipt } from "./useUploadSupplierReceipt";
import type { SupplierPaymentFormData } from "../lib/supplierPaymentSchema";

export function useSubmitSupplierPayment({ billId }: { billId: string }) {
  const [serverBlock, setServerBlock] = useState<BusinessBlock | null>(null);
  const register = useRegisterSupplierPayment({
    onBusinessBlock: (block) => {
      setServerBlock({
        ...block,
        reason: "El saldo pendiente cambió antes de que se guardara el pago.",
        nextStep: "Revisa el saldo actualizado que aparece arriba y confirma el monto antes de volver a intentar.",
      });
    },
  });
  const uploader = useUploadSupplierReceipt();

  const submitPayment = async (
    data: SupplierPaymentFormData,
    receiptFile: File | null,
    onCompleted: () => void,
  ) => {
    setServerBlock(null);
    let receipt_url = data.receipt_url || undefined;
    let uploadedPath: string | undefined;
    if (receiptFile) {
      const uploaded = await uploader.mutateAsync({ file: receiptFile, billId });
      // N-9: persistimos el path, no una signed URL de 5 años.
      receipt_url = uploaded.path;
      uploadedPath = uploaded.path;
    }
    try {
      await register.mutateAsync({
        bill_id: billId,
        amount: data.amount,
        payment_date: toYMD(data.payment_date) ?? "",
        payment_method: data.payment_method || undefined,
        bank_account: data.bank_account || undefined,
        reference: data.reference || undefined,
        receipt_url,
        notes: data.notes || undefined,
      });
      onCompleted();
    } catch {
      // A failed payment must not leave an unreferenced receipt in Storage.
      if (uploadedPath) {
        const { error } = await removeSupplierReceipt(uploadedPath);
        if (error) {
          notifyWarning("No se pudo limpiar el comprobante", {
            error,
            description: "El pago no se registró. Contacta a soporte para revisar el archivo subido.",
          });
        }
      }
    }
  };

  return {
    submitPayment,
    isPending: register.isPending || uploader.isPending,
    isUploading: uploader.isPending,
    serverBlock,
  };
}
