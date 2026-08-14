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
    // El "hoy" del servidor cambia una vez al día, pero con staleTime largo
    // una sesión abierta cerca de medianoche podía quedarse con la fecha del
    // día anterior. 60s mantiene la fecha razonablemente fresca sin presionar
    // la RPC (una llamada por minuto como máximo por sesión activa).
    staleTime: 60 * 1000,
    retry: 1,
  });

  return data ?? toYMD(nowMty());
}
