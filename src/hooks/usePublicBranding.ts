import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Obtiene logo y razón social de la empresa SIN requerir sesión.
 * Usa una RPC pública que solo expone campos no sensibles.
 * Pensado para pantallas públicas (login, portal de clientes pre-login).
 */
export function usePublicBranding() {
  return useQuery({
    queryKey: ["public_branding"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_branding");
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return row as { logo_url: string | null; razon_social: string | null } | null;
    },
  });
}
