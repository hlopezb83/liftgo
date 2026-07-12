import { useQuery } from "@tanstack/react-query";
import { publicBrandingQueries } from "../lib/queryKeys";

/**
 * Obtiene logo y razón social de la empresa SIN requerir sesión.
 * Usa una RPC pública que solo expone campos no sensibles.
 * Pensado para pantallas públicas (login, portal de clientes pre-login).
 */
export function usePublicBranding() {
  return useQuery(publicBrandingQueries.list());
}
