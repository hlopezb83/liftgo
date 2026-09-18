/**
 * Utilitarios centralizados de assets para los builders de PDF
 * (logos e iconografía). Cualquier builder bajo `src/lib/pdf/**` debe
 * consumir estas funciones en lugar de importar fetchers locales por feature.
 */
import { resolveLogoSrc } from "@/lib/branding/logoSource";

/**
 * Descarga una imagen desde una URL y la convierte a data URL base64.
 * Devuelve null si la imagen no se puede cargar (CORS, URL inválida, etc.).
 */
export async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    // Sin credenciales ni referer: la imagen de marca es pública y el logo de
    // empresa ya viene firmado; nunca se envía la sesión a un host de imagen.
    const response = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Wrapper null-safe para cargar el logo de la empresa.
 *
 * El valor persistido no se descarga tal cual: se clasifica antes. Si es un
 * logo de empresa se resuelve a una URL firmada de TTL corto del Storage de
 * este proyecto; si es la marca global de LiftGo se descarga su URL pública
 * HTTPS sin credenciales ni referer. Esquemas no soportados (http:, data:,
 * blob:, rutas con salto de nivel) generan el PDF sin logo (fail-closed).
 */
export async function loadCompanyLogo(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  const src = await resolveLogoSrc(logoUrl);
  if (!src) return null;
  return loadImageAsBase64(src);
}
