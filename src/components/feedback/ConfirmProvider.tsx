import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConfirmContext, type Confirm, type ConfirmOptions } from "./confirmContext";



interface DialogState extends ConfirmOptions {
  open: boolean;
}

const INITIAL: DialogState = {
  open: false,
  title: "",
};

/**
 * Provider global que expone `useConfirm()` como reemplazo directo del
 * antipatrón `if (window.confirm("…"))`:
 *
 * ```tsx
 * const confirm = useConfirm();
 * if (await confirm({ title: "¿Eliminar?", destructive: true })) del.mutate(id);
 * ```
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(INITIAL);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const confirm = useCallback<Confirm>((opts) => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        destructive={state.destructive}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext>
  );
}
