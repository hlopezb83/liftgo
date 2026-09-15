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
import { buildIdentityScope, isIdentityQueryKey } from "@/lib/query/identityScope";
import {
  createBrowserPersister,
  purgeForeignPersistedCaches,
  PERSIST_MAX_AGE_MS,
  shouldPersistQuery,
} from "@/lib/query/persister";

export function useVerifiedIdentityScope(): string | null {
  const { user } = useAuth();
  const org = useOrganizationContext();
  if (!user || org.status !== "ready") return null;
  return buildIdentityScope({
    userId: user.id,
    organizationId: org.organizationId,
    memberType: org.memberType,
  });
}

export function IdentityScopedPersistence({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const scope = useVerifiedIdentityScope();
  // `null` hasta que la caché de la identidad actual está lista para usarse.
  const [readyScope, setReadyScope] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setReadyScope(null);

    // Cambió la identidad (o no hay ninguna): nada de la sesión previa debe
    // sobrevivir, ni siquiera una respuesta que llegue tarde. La purga se hace
    // de forma síncrona, en el mismo commit en que se oculta el contenido.
    const notIdentity = {
      predicate: (query: { queryKey: readonly unknown[] }) => !isIdentityQueryKey(query.queryKey),
    };
    void queryClient.cancelQueries(notIdentity);
    queryClient.removeQueries(notIdentity);

    const run = async () => {
      // Una consulta que ya estaba resolviéndose puede reinsertarse al
      // completarse; se vuelve a purgar tras ceder el turno al microtask.
      await Promise.resolve();
      queryClient.removeQueries(notIdentity);

      if (typeof window !== "undefined") {
        purgeForeignPersistedCaches(window.localStorage, scope);
      }

      if (!scope) return;

      const [unsub, restored] = persistQueryClient({
        queryClient,
        persister: createBrowserPersister(scope),
        maxAge: PERSIST_MAX_AGE_MS,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        buster: scope,
      });
      unsubscribe = unsub;
      await restored;
      if (cancelled) return;
      setReadyScope(scope);
    };

    void run();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [scope, queryClient]);

  // Sin identidad verificada no hay contenido protegido que mostrar: el gate de
  // organización y AuthGuard deciden qué se ve (carga, error, sin membresía).
  if (!scope) return <>{children}</>;

  // Con identidad verificada, se espera a que la caché anterior se haya
  // limpiado y la nueva restaurado antes de renderizar datos protegidos.
  if (readyScope !== scope) return null;

  return <>{children}</>;
}
