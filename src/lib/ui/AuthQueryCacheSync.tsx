import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { clearSentryIdentityForUser } from "@/lib/observability/identity";
import { isActorAccessQueryKey, isIdentityQueryKey } from "@/lib/query/identityScope";
import { dismissNotifications } from "@/lib/ui/appFeedback";
import { getAuthSnapshot, setAuthSnapshot } from "@/lib/ui/authSnapshot";

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
      dismissNotifications();
      clearSentryIdentityForUser(prevUserId.current);
      if (getAuthSnapshot().user?.id !== currentUserId) {
        setAuthSnapshot({ user: null, organization: null, role: null });
      }
      // La verificación del usuario entrante puede haber comenzado en este
      // commit. Se cancela y retira únicamente la caché ajena a esa verificación.
      const previousSession = {
        predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
          !(isIdentityQueryKey(queryKey) && queryKey[1] === currentUserId) &&
          !isActorAccessQueryKey(queryKey, currentUserId),
      };
      void queryClient.cancelQueries(previousSession);
      queryClient.removeQueries(previousSession);
    }
    prevUserId.current = currentUserId;
  }, [user?.id, queryClient]);

  return null;
}
