import { useEffect } from "react";
import { useBlocker } from "react-router";
import { useConfirm } from "@/components/feedback/useConfirm";

/**
 * UX-A4: bloquea la navegación cuando el formulario tiene cambios sin guardar.
 *
 * - Muestra el diálogo nativo del navegador al recargar / cerrar pestaña (beforeunload).
 * - Intercepta navegaciones internas de React Router con `useBlocker` y pide confirmación.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const confirm = useConfirm();

  // Aviso nativo del navegador al recargar o cerrar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome/Firefox exigen returnValue para mostrar el prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Navegación interna: bloquea y pide confirmación async.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
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
