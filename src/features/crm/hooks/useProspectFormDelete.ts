import { useRef, useState } from "react";

interface Options {
  open: boolean;
  prospectId?: string;
  companyName?: string;
  isPending: boolean;
  onDelete?: () => void | Promise<unknown>;
  onClose: () => void;
}

export function useProspectFormDelete({ open, prospectId, companyName, isPending, onDelete, onClose }: Options) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const [session, setSession] = useState({ open, prospectId });
  if (session.open !== open || session.prospectId !== prospectId) {
    setSession({ open, prospectId });
    setConfirmOpen(false);
  }
  const pending = isPending || deleting;

  const handleDelete = async () => {
    if (!onDelete || pending || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch {
      // The mutation reports the error. Keep the original form and draft open.
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  };

  return {
    pending,
    requestDelete: () => { if (!pending) setConfirmOpen(true); },
    confirmation: {
      open: open && confirmOpen,
      onOpenChange: setConfirmOpen,
      title: "¿Eliminar prospecto?",
      description: `Esta acción no se puede deshacer. Se eliminará permanentemente el prospecto "${companyName ?? ""}".`,
      confirmLabel: "Eliminar",
      destructive: true,
      loading: pending,
      onConfirm: () => { void handleDelete(); },
    },
  };
}
