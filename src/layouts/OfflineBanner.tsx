import { useSyncExternalStore } from "react";

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getOnlineSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

/**
 * R6-FE-10 (offline consolidado ×4): banner "Sin conexión" global.
 * No había ningún listener online/offline en src (grep verificado).
 */
export function OfflineBanner({ inline = false }: { inline?: boolean } = {}) {
  // SSR-safe: el servidor no conoce la conectividad del cliente; se asume
  // online (banner oculto) y el estado real se sincroniza tras la hidratación
  // para no provocar mismatch de HTML servidor/cliente.
  const online = useSyncExternalStore(subscribeToConnectivity, getOnlineSnapshot, getServerSnapshot);

  if (online) return null;
  return (
    <div
      role="status"
      className={
        inline
          ? "w-full shrink-0 bg-destructive text-destructive-foreground text-center text-xs sm:text-sm py-1.5 px-4"
          : "fixed top-0 inset-x-0 z-50 bg-destructive text-destructive-foreground text-center text-sm py-2 px-4"
      }
    >
      Sin conexión — los cambios no se guardarán hasta que vuelva internet.
    </div>
  );
}
