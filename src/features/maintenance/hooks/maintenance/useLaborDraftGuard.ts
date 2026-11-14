import { useState } from "react";

export interface LaborDraftState {
  dirty: boolean;
  pending: boolean;
}

/** Both OT inspectors protect the same local, unregistered labor capture. */
export function useLaborDraftGuard(recordId: string | undefined, open: boolean) {
  const [session, setSession] = useState({ recordId, open });
  const [draft, setDraft] = useState<LaborDraftState>({ dirty: false, pending: false });
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [resetKey, setResetKey] = useState(0);

  if (session.recordId !== recordId || session.open !== open) {
    setSession({ recordId, open });
    setDraft({ dirty: false, pending: false });
    setDiscardAction(null);
  }

  const requestLeave = (action: () => void) => {
    if (draft.pending) return;
    if (draft.dirty) setDiscardAction(() => action);
    else action();
  };

  return {
    onDraftChange: setDraft,
    resetKey,
    requestLeave,
    discardDialog: {
      open: open && discardAction !== null,
      onOpenChange: (next: boolean) => { if (!next) setDiscardAction(null); },
      title: "¿Descartar la captura de mano de obra?",
      description: "Tienes mano de obra sin registrar. Los datos capturados se perderán.",
      confirmLabel: "Descartar",
      cancelLabel: "Seguir capturando",
      destructive: true,
      onConfirm: () => {
        setDraft({ dirty: false, pending: false });
        setResetKey((key) => key + 1);
        setDiscardAction(null);
        discardAction?.();
      },
    },
  };
}
