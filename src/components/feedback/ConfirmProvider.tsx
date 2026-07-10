import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

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
    // Si hay una promesa pendiente sin resolver, la resolvemos como false para
    // evitar leaks al re-abrir.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
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
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}
