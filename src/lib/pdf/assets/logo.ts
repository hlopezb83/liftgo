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
 * Logo EMPRESARIAL en documentos: el valor persistido nunca se descarga tal
 * cual. Se resuelve antes a una URL firmada de TTL corto del Storage de este
 * proyecto, de forma que el documento sólo puede llevar el logo de su propia
 * empresa. Host ajeno, http en claro, `data:` o ruta no válida generan el PDF
 * sin logo (fail-closed) en vez de un fetch arbitrario.
 */
export async function loadCompanyLogo(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  const src = await resolveLogoSrc(logoUrl);
  if (!src) return null;
  return loadImageAsBase64(src);
}
