/**
 * Utilitarios centralizados de assets para los builders de PDF
 * (logos e iconografía). Cualquier builder bajo `src/lib/pdf/**` debe
 * consumir estas funciones en lugar de importar fetchers locales por feature.
 */

/**
 * Descarga una imagen desde una URL y la convierte a data URL base64.
 * Devuelve null si la imagen no se puede cargar (CORS, URL inválida, etc.).
 */
export async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
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
 * Si no hay URL, regresa null sin hacer fetch.
 */
export async function loadCompanyLogo(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  return loadImageAsBase64(logoUrl);
}
