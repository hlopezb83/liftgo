import type { FormDialog } from "@/components/forms/FormDialog";
import type { useToggleDialog } from "@/hooks/useDialogState";
import { ExportPaymentsDialog } from "./ExportPaymentsDialog";
import { PaymentBatchesDialog } from "./PaymentBatchesDialog";
import type { ComponentProps } from "react";

export function PaymentBatchDialogs({ canManage, exportDialog, batchesDialog, onCloseAutoFocus }: {
  canManage: boolean;
  exportDialog: ReturnType<typeof useToggleDialog>;
  batchesDialog: ReturnType<typeof useToggleDialog>;
  onCloseAutoFocus?: ComponentProps<typeof FormDialog>["onCloseAutoFocus"];
}) {
  if (!canManage) return null;
  return <>
    <ExportPaymentsDialog open={exportDialog.open} onOpenChange={exportDialog.setOpen} onCloseAutoFocus={onCloseAutoFocus} />
    <PaymentBatchesDialog open={batchesDialog.open} onOpenChange={batchesDialog.setOpen} onCloseAutoFocus={onCloseAutoFocus} />
  </>;
}