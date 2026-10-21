import { useCallback, useRef, useState } from "react";

/** Resolve the current row at close, not the node captured before a refetch. */
export function useStatementBillFocus() {
  const [billId, setBillId] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const selectedRow = useRef<string | null>(null);
  const registerTrigger = useCallback(
    (rowKey: string, element: HTMLButtonElement | null) => {
      if (element) triggers.current.set(rowKey, element);
      else triggers.current.delete(rowKey);
    },
    [],
  );
  const openBill = (id: string, rowKey: string) => {
    selectedRow.current = rowKey;
    setBillId(id);
  };
  const onCloseAutoFocus = (event: Event) => {
    const button = selectedRow.current
      ? triggers.current.get(selectedRow.current)
      : undefined;
    const target =
      button?.isConnected && !button.disabled ? button : inspectorRef.current;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  };
  return {
    billId,
    setBillId,
    inspectorRef,
    registerTrigger,
    openBill,
    onCloseAutoFocus,
  };
}
