import { useQuery } from "@tanstack/react-query";
import {
  LOGO_SIGNED_TTL_SECONDS,
  classifyLogoSource,
  resolveLogoSrc,
} from "@/lib/branding/logoSource";

/**
 * Devuelve una URL de visualización segura para el logo de la empresa del
 * contexto autenticado. Fail-closed: si el valor persistido no es una ruta o
 * URL del Storage de este proyecto, devuelve `null` y la interfaz usa el
 * distintivo de respaldo.
 */
export function useCompanyLogoSrc(logoUrl: string | null | undefined): string | null {
  const source = classifyLogoSource(logoUrl);
  const key = source.kind === "storage" ? `${source.bucket}/${source.path}` : null;

  const { data } = useQuery({
    queryKey: ["company_logo_src", key],
    enabled: key !== null,
    // Se refresca antes de que expire la firma; nunca se persiste el enlace.
    staleTime: (LOGO_SIGNED_TTL_SECONDS - 30) * 1000,
    gcTime: LOGO_SIGNED_TTL_SECONDS * 1000,
    queryFn: () => resolveLogoSrc(logoUrl),
  });

  return data ?? null;
}
