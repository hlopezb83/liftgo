import { useCallback, useEffect, useRef } from "react";
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

/** R9 Bloque 2 (capa 3, hardening): la ventana entre que `formState.isSubmitting`
 *  baja a `false` (RHF resolvió la validación) y `isPending` (React Query) sube
 *  a `true` (la mutación arrancó) puede tardar hasta ~340ms observados en
 *  producción (crear cotización) — en ese hueco `busy` es transitoriamente
 *  `false`. Debounceamos la liberación del guard ese tiempo antes de soltarlo. */
const RELEASE_DEBOUNCE_MS = 400;
/** Si nunca hubo mutación (p.ej. error de validación async resuelto sin que
 *  `busy` llegue a ser `true` en ningún render observado), liberamos el guard
 *  de todas formas tras este timeout de seguridad para no bloquear reintentos. */
const SAFETY_TIMEOUT_MS = 1000;

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
 * submit.
 *
 * R9 Bloque 2 (capa 3, hardening — auditoría R9): `busy` puede pasar por un
 * `false` transitorio entre que RHF termina de validar (`isSubmitting` baja)
 * y la mutación de React Query arranca (`isPending` sube). Si liberamos
 * `inFlightRef` en ese instante, un segundo click que llegue en esa ventana
 * (reproducido a 340ms en Crear Cotización, 0.6s en Agregar Cliente) dispara
 * un submit duplicado. Por eso ya NO liberamos el guard en el primer `false`:
 * esperamos a que `busy` permanezca `false` de forma estable
 * (`RELEASE_DEBOUNCE_MS`) antes de soltarlo — si `busy` vuelve a `true` en ese
 * intervalo (la mutación arrancó), cancelamos la liberación. Como red de
 * seguridad, si nunca se observó `busy === true` tras iniciar el submit
 * (p. ej. la validación async falla sin llegar a mutar), liberamos por
 * `SAFETY_TIMEOUT_MS` para no bloquear reintentos indefinidamente.
 */
export function FormActions({ submitLabel, isPending, onCancel, submitDisabled, submitDisabledReason }: FormActionsProps) {
  const ctx = useFormContext();
  const isSubmitting = ctx?.formState?.isSubmitting ?? false;
  const busy = isPending || isSubmitting;
  const submitBlocked = busy || submitDisabled;
  const inFlightRef = useRef(false);
  const hasBeenBusyRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R23-A: dentro de un FormDialog, "Cancelar" pasa por el mismo guard de
  // cambios sin guardar que Esc y el click fuera.
  const requestClose = useFormDialogClose();
  const handleCancel = requestClose ?? onCancel;

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);
  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);
  const release = useCallback(() => {
    inFlightRef.current = false;
    hasBeenBusyRef.current = false;
    clearReleaseTimer();
    clearSafetyTimer();
  }, [clearReleaseTimer, clearSafetyTimer]);

  useEffect(() => {
    if (busy) {
      // La mutación (o la validación) está en curso: ya no necesitamos la
      // red de seguridad ni una liberación pendiente por un `false` previo.
      hasBeenBusyRef.current = true;
      clearReleaseTimer();
      clearSafetyTimer();
      return;
    }
    if (!hasBeenBusyRef.current) return;
    clearReleaseTimer();
    releaseTimerRef.current = setTimeout(release, RELEASE_DEBOUNCE_MS);
    return clearReleaseTimer;
  }, [busy, clearReleaseTimer, clearSafetyTimer, release]);

  // Cleanup de timers al desmontar (evita setState/timers huérfanos).
  useEffect(() => () => {
    clearReleaseTimer();
    clearSafetyTimer();
  }, [clearReleaseTimer, clearSafetyTimer]);


  // El guard vive en `onClick` (no en `onPointerDown`): `click` siempre se
  // dispara — con puntero, teclado o `fireEvent.click` — y llamar
  // `preventDefault()` aquí cancela el submit del formulario de forma síncrona,
  // sin depender de que React haya flusheado `disabled`.
  const blockIfBusy = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy || inFlightRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    inFlightRef.current = true;
    hasBeenBusyRef.current = false;
    clearReleaseTimer();
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(release, SAFETY_TIMEOUT_MS);
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

        <Button type="submit" disabled={submitBlocked} onClick={blockIfBusy}>

          {busy && <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />}
          {busy ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
