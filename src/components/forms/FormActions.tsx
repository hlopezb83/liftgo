import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface FormActionsProps {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
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
export function FormActions({ submitLabel, isPending, onCancel }: FormActionsProps) {
  const ctx = useFormContext();
  const isSubmitting = ctx?.formState?.isSubmitting ?? false;
  const busy = isPending || isSubmitting;
  const inFlightRef = useRef(false);

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
    <div className="flex gap-3 pt-2">
      <Button type="submit" disabled={busy} onPointerDown={blockIfBusy}>
        {busy && <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />}
        {busy ? "Guardando…" : submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
    </div>
  );
}
