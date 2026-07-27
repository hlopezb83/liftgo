import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { useConfirm } from "@/components/feedback/useConfirm";

/**
 * UX-A4 + R16 F-03: bloquea la navegación cuando el formulario tiene cambios sin guardar.
 *
 * Acepta `boolean` (legacy) o `() => boolean` (recomendado). El getter se evalúa
 * DENTRO del callback del blocker → lee refs/formState al momento de bloquear,
 * lo que resuelve la carrera `justSavedRef=true → reset() → navigate()` en el mismo tick.
 */
export function useUnsavedChangesGuard(isDirty: boolean | (() => boolean)) {
  const confirm = useConfirm();

  const getter = typeof isDirty === "function" ? isDirty : () => isDirty;
  const getterRef = useRef(getter);
  useEffect(() => {
    getterRef.current = getter;
  });

  // Aviso nativo del navegador al recargar o cerrar. Solo se suscribe cuando
  // el flag booleano indica cambios sin guardar; si se pasa un getter dinámico,
  // se suscribe siempre y consulta el getter en el momento del evento.
  const shouldSubscribe = typeof isDirty === "function" ? true : isDirty;
  useEffect(() => {
    if (!shouldSubscribe) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!getterRef.current()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldSubscribe]);

  // Navegación interna: bloquea y pide confirmación async.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      getterRef.current() && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void (async () => {
      const ok = await confirm({
        title: "¿Descartar cambios?",
        description: "Tienes cambios sin guardar. Si continúas, se perderán.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        destructive: true,
      });
      if (ok) blocker.proceed?.();
      else blocker.reset?.();
    })();
  }, [blocker, confirm]);
}
