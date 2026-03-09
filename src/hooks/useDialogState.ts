import { useState, useCallback } from "react";

/**
 * Hook for managing dialog state with form data.
 * Combines open/close state with form management to prevent common reset errors.
 */
export function useDialogState<T extends Record<string, unknown>>(initialForm: T) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<T>(initialForm);

  const openDialog = useCallback((prefilledForm?: Partial<T>) => {
    if (prefilledForm) {
      setForm({ ...initialForm, ...prefilledForm });
    } else {
      setForm(initialForm);
    }
    setOpen(true);
  }, [initialForm]);

  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  const resetForm = useCallback(() => {
    setForm(initialForm);
  }, [initialForm]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setForm(initialForm);
    }
  }, [initialForm]);

  return {
    open,
    form,
    setForm,
    setField,
    openDialog,
    closeDialog,
    resetForm,
    onOpenChange,
  };
}
