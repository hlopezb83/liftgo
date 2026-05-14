import { useState, useCallback } from "react";

/**
 * Generic helper that consolidates the common "selected entity acts as both
 * dialog/sheet open state and edit target" pattern used across detail pages.
 *
 * Usage:
 *   const detail = useDialogState<Part>();
 *   detail.open(part)        // sets selected and marks as open
 *   detail.close()           // clears
 *   <Sheet open={detail.isOpen} onOpenChange={detail.onOpenChange}>
 */
export function useDialogState<T = unknown>() {
  const [selected, setSelected] = useState<T | null>(null);

  const open = useCallback((value: T) => setSelected(value), []);
  const close = useCallback(() => setSelected(null), []);
  const onOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) setSelected(null);
  }, []);

  return {
    selected,
    setSelected,
    isOpen: selected !== null,
    open,
    close,
    onOpenChange,
  };
}

/**
 * Boolean variant for plain create/confirm dialogs without a payload.
 */
export function useToggleDialog(initial = false) {
  const [open, setOpen] = useState(initial);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);
  return { open, setOpen, openDialog, closeDialog };
}
