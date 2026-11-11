/**
 * Persistencia y aislamiento de caché por identidad verificada.
 *
 * Reglas:
 * - No se restaura nada hasta que la sesión (AuthProvider) y la organización
 *   (OrganizationProvider) están resueltas.
 * - Al cambiar la identidad (usuario u organización) se cancelan las consultas
 *   en vuelo y se limpia la caché anterior ANTES de restaurar o renderizar,
 *   de modo que una respuesta tardía de la sesión previa no puede escribir en
 *   la caché ni en la UI.
 * - Las cachés persistidas de otras identidades (y las globales anteriores) se
 *   eliminan del almacenamiento del navegador.
 */
import { useQueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { isActorAccessQueryKey, isIdentityQueryKey } from "@/lib/query/identityScope";
import {
  createBrowserPersister,
  getBrowserStorage,
  purgeForeignPersistedCaches,
  PERSIST_MAX_AGE_MS,
  shouldPersistQuery,
} from "@/lib/query/persister";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { syncFormDraftIdentity } from "@/lib/storage/formDraftStorage";

export function IdentityScopedPersistence({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  const scope = useVerifiedIdentityScope();
  const { status } = useOrganizationContext();
  const identityAbsent = status === "signed-out" || status === "no-membership";
  // `null` hasta que la caché de la identidad actual está lista para usarse.
  const [readyScope, setReadyScope] = useState<string | null>(null);
  // Estado derivado durante el render (patrón soportado por React): al cambiar
  // la identidad el contenido deja de renderizarse en ese mismo commit.
  const [trackedScope, setTrackedScope] = useState<string | null>(scope);
  if (trackedScope !== scope) {
    setTrackedScope(scope);
    setReadyScope(null);
  }

  useEffect(() => {
    // Loading/error is not logout: retain the verified draft until identity resolves.
    if (scope) syncFormDraftIdentity(scope);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;



    // Cambió la identidad (o no hay ninguna): nada de la sesión previa debe
    // sobrevivir, ni siquiera una respuesta que llegue tarde. La purga se hace
    // de forma síncrona, en el mismo commit en que se oculta el contenido.
    const previousWorkspace = {
      predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
        !isIdentityQueryKey(queryKey) && !isActorAccessQueryKey(queryKey, userId),
    };
    void queryClient.cancelQueries(previousWorkspace);
    queryClient.removeQueries(previousWorkspace);

    const run = async () => {
      // Una consulta que ya estaba resolviéndose puede reinsertarse al
      // completarse; se vuelve a purgar tras ceder el turno al microtask.
      await Promise.resolve();
      if (cancelled) return;
      queryClient.removeQueries(previousWorkspace);

      if (!scope) {
        // La verificación pendiente o fallida no confirma un cierre de sesión.
        if (identityAbsent) {
          const storage = getBrowserStorage();
          if (storage) purgeForeignPersistedCaches(storage, null);
        }
        return;
      }

      const [unsub, restored] = persistQueryClient({
        queryClient,
        persister: createBrowserPersister(scope, getBrowserStorage(), () => !cancelled),
        maxAge: PERSIST_MAX_AGE_MS,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        buster: scope,
      });
      unsubscribe = unsub;
      try {
        await restored;
      } catch {
        // The persistence SDK rejects failed restoration after attempting to discard
        // corrupt/unavailable storage. Keep the already-cleared, identity-scoped
        // in-memory cache usable; do not retry or subscribe to broken storage.
        unsubscribe();
        if (!cancelled) console.warn("Query cache restoration unavailable; using memory only.");
      }
      if (cancelled) return;
      setReadyScope(scope);
    };

    void run();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [scope, identityAbsent, queryClient, userId]);

  // Sin identidad verificada no hay contenido protegido que mostrar: el gate de
  // organización y AuthGuard deciden qué se ve (carga, error, sin membresía).
  if (!scope) return <>{children}</>;

  // Con identidad verificada, se espera a que la caché anterior se haya
  // limpiado y la nueva restaurado antes de renderizar datos protegidos.
  if (readyScope !== scope) return null;

  return <>{children}</>;
}
