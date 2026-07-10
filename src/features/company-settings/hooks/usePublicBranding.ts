import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

type PublicBrandingRow = { logo_url: string | null; razon_social: string | null };

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
      const data = await callRpc<PublicBrandingRow[] | null>("get_public_branding");
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return row;
    },
  });
}
