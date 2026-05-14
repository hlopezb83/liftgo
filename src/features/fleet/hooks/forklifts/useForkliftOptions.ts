import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ForkliftOption {
  id: string;
  name: string;
  model: string;
  manufacturer: string | null;
  status: string;
}

/**
 * Hook ligero para selectors de equipos: solo 5 columnas + cache de 5 minutos.
 * Reemplaza el uso de `useForklifts()` cuando solo se necesita id/nombre/estado.
 */
export function useForkliftOptions() {
  return useQuery({
    queryKey: ["forklift-options"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ForkliftOption[]> => {
      const { data, error } = await supabase
        .from("forklifts")
        .select("id, name, model, manufacturer, status")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
