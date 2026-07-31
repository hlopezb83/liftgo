import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useFormDialogClose } from "./formDialogContext";

interface FormActionsProps {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
  /** BL-R8-07 (R8-FE-03): bloqueo externo del submit (p. ej. daño abierto en
   *  cierre de OT). No es "busy": no muestra spinner ni activa inFlight. */
  submitDisabled?: boolean;
  /** Razón visible del bloqueo (recomendado cuando submitDisabled=true). */
  submitDisabledReason?: string;
}


/**
 * Bloque 2.1 (v7.146.0): además de `isPending` de la mutación, consumimos
 * `formState.isSubmitting` del contexto de react-hook-form para bloquear el
 * botón mientras se resuelve la validación async (Zod). Esto previene el
 * doble submit por doble click rápido — bug reproducido en Crear Cliente.
 *
 * R7 Bloque 3: bloqueamos también en `onPointerDown` porque un doble-click
 * nativo dispara dos submits antes de que React flushee `disabled`.
 *
 * R9 Bloque 2 (capa 3): `inFlightRef` es una guarda síncrona inmune al ciclo
 * de render — cubre la ventana <25ms donde `busy` aún no reflejó el primer
 * submit. Se libera cuando `busy` vuelve a `false` para permitir reintentos
 * tras un error de validación async o mutación fallida.
 */
export function FormActions({ submitLabel, isPending, onCancel, submitDisabled, submitDisabledReason }: FormActionsProps) {
  const ctx = useFormContext();
  const isSubmitting = ctx?.formState?.isSubmitting ?? false;
  const busy = isPending || isSubmitting;
  const submitBlocked = busy || submitDisabled;
  const inFlightRef = useRef(false);
  // R23-A: dentro de un FormDialog, "Cancelar" pasa por el mismo guard de
  // cambios sin guardar que Esc y el click fuera.
  const requestClose = useFormDialogClose();
  const handleCancel = requestClose ?? onCancel;

  useEffect(() => {
    if (!busy) inFlightRef.current = false;
  }, [busy]);

  const blockIfBusy = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (busy || inFlightRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    inFlightRef.current = true;
  };
  return (
    // Oleada 2 (B-7): convención única de footer — Cancelar a la izquierda,
    // acción primaria a la derecha, en todos los diálogos de la app.
    <div className="space-y-2">
      {submitDisabled && submitDisabledReason && (
        <p className="text-xs text-destructive text-right">{submitDisabledReason}</p>
      )}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>Cancelar</Button>

        <Button type="submit" disabled={submitBlocked} onPointerDown={blockIfBusy}>
          {busy && <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />}
          {busy ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
