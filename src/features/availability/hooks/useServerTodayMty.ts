import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";

/**
 * R10.9: fecha "hoy" (TZ Monterrey) como YYYY-MM-DD, resuelta en el servidor
 * vía `today_mty()` para no depender del reloj/TZ del navegador en el cálculo
 * de disponibilidad de flota. Si la RPC falla, cae al reloj local — nunca
 * bloquea el dashboard de disponibilidad.
 */
export function useServerTodayMty(): string {
  const { data } = useQuery({
    queryKey: ["server-today-mty"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("today_mty");
      if (error) throw error;
      return data as string;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return data ?? toYMD(nowMty());
}
