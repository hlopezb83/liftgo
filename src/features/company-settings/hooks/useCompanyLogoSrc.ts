import { useQuery } from "@tanstack/react-query";
import {
  LOGO_SIGNED_TTL_SECONDS,
  classifyLogoSource,
  resolveLogoSrc,
} from "@/lib/branding/logoSource";

/**
 * URL de visualización del **logo empresarial** (`company_settings.logo_url`),
 * firmada con la sesión actual y TTL corto: el aislamiento por organización lo
 * imponen las policies de Storage. Fail-closed (`null`) para valores no
 * verificables. No se usa para la marca de producto del ERP.
 */
export function useCompanyLogoSrc(
  logoUrl: string | null | undefined,
): string | null {
  const source = classifyLogoSource(logoUrl);
  const key =
    source.kind === "storage" ? `${source.bucket}/${source.path}` : null;

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
