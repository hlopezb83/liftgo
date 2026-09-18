/**
 * Utilitarios centralizados de assets para los builders de PDF
 * (logos e iconografía). Cualquier builder bajo `src/lib/pdf/**` debe
 * consumir estas funciones en lugar de importar fetchers locales por feature.
 */
import { GLOBAL_BRAND_LOCKUP_PATH } from "@/lib/branding/globalBrandLogo";

/**
 * Descarga una imagen desde una URL y la convierte a data URL base64.
 * Devuelve null si la imagen no se puede cargar (CORS, URL inválida, etc.).
 */
export async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    // Sin credenciales ni referer: el asset de marca es local y público.
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

let cached: Promise<string | null> | null = null;

/**
 * Logo de los documentos: SIEMPRE el asset local global de LiftGo.
 *
 * No existe logo por organización: no se lee `company_settings.logo_url`, no
 * se firma nada en Storage y no se hace fetch a hosts externos. La ruta es
 * relativa al propio origen, así que A y B obtienen exactamente la misma
 * imagen, con sus colores y proporciones originales.
 */
export function loadGlobalBrandLogo(): Promise<string | null> {
  cached ??= loadImageAsBase64(GLOBAL_BRAND_LOCKUP_PATH);
  return cached;
}

/** Sólo para pruebas: limpia la caché del asset global. */
export function resetGlobalBrandLogoCache(): void {
  cached = null;
}
