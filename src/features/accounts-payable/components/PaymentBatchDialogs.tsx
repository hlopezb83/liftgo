import type { ComponentProps } from "react";
import type { FormDialog } from "@/components/forms/FormDialog";
import type { useToggleDialog } from "@/hooks/useDialogState";
import { ExportPaymentsDialog } from "./ExportPaymentsDialog";
import { PaymentBatchesDialog } from "./PaymentBatchesDialog";

/** Sólo sustituye el foco predeterminado si el botón actual sigue disponible. */
export function restorePaymentActionsFocus(event: Event, target: HTMLButtonElement | null) {
  if (!target?.isConnected || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  if (target.getClientRects().length === 0) return;
  const style = getComputedStyle(target);
  if (style.visibility === "hidden" || style.visibility === "collapse") return;
  event.preventDefault();
  target.focus({ preventScroll: true });
}

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