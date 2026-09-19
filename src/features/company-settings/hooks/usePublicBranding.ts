import { useQuery } from "@tanstack/react-query";
import { publicBrandingQueries } from "../lib/queryKeys";

/**
 * Obtiene la **identidad legal mínima** de la organización (razón social) SIN
 * requerir sesión, mediante una RPC pública que sólo expone campos no
 * sensibles. Pensado para pantallas públicas (login, portal pre-login).
 *
 * No devuelve ni existe un logo por organización: el logo de LiftGo es global
 * y fijo (asset local del repositorio) para todas las organizaciones.
 */
export function usePublicBranding() {
  return useQuery(publicBrandingQueries.list());
}
