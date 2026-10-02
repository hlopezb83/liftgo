import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import type { PlatformAccess } from "@/lib/platformAccess.types";
import { createAppQueryClient } from "@/lib/query/appQueryClient";
import { PlatformAccessContext } from "../hooks/usePlatformAccess";

/** Se remonta por actor + revisión: retira caché, formularios y respuestas tardías. */
export function PlatformAccessScope({ access, children }: { access: PlatformAccess; children: ReactNode }) {
  const [client] = useState(createAppQueryClient);
  useEffect(() => () => {
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <PlatformAccessContext.Provider value={access}>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </PlatformAccessContext.Provider>;
}
