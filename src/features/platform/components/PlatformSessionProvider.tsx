import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createAppQueryClient } from "@/lib/query/appQueryClient";
import { purgeForeignPersistedCaches } from "@/lib/query/persister";

/** Caché de plataforma en memoria, independiente de la empresa y del actor anterior. */
export function PlatformSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const organizationClient = useQueryClient();
  useEffect(() => {
    // Al abandonar el ERP, cancelar respuestas tardías y retirar también su
    // identidad: regresar exige verificar nuevamente la empresa en el servidor.
    void organizationClient.cancelQueries();
    organizationClient.clear();
  }, [organizationClient]);
  return <PlatformActorScope key={user?.id ?? "anonymous"}>{children}</PlatformActorScope>;
}

function PlatformActorScope({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);

  useEffect(() => {
    // No restaurar ni conservar datos empresariales persistidos en este ámbito.
    try {
      purgeForeignPersistedCaches(window.localStorage, null);
    } catch {
      // El navegador puede bloquear incluso el getter de localStorage.
    }
    return () => {
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
