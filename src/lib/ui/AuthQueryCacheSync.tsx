import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Limpia el caché global de TanStack Query cuando el usuario cambia
 * (incluyendo cierre de sesión) para evitar fugas de datos entre sesiones.
 *
 * Se monta dentro de AuthProvider + QueryClientProvider.
 */
export function AuthQueryCacheSync(): null {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    // Evitar limpieza en el montaje inicial (prevUserId es undefined).
    // Después, cualquier cambio de usuario (incluyendo null por sign-out)
    // invalida todo el caché.
    if (prevUserId.current !== undefined && prevUserId.current !== currentUserId) {
      queryClient.clear();
    }
    prevUserId.current = currentUserId;
  }, [user?.id, queryClient]);

  return null;
}
