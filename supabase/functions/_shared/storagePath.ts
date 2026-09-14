import { isUUID } from "./validate.ts";

/**
 * Construye una ruta de Storage bajo una organización verificable.
 * Los procesos privilegiados deben derivar el ID del registro de negocio,
 * nunca de una entrada proporcionada por el cliente.
 */
export function organizationStoragePath(
  organizationId: unknown,
  relativePath: string,
): string {
  const organization = typeof organizationId === "string"
    ? organizationId.trim().toLowerCase()
    : "";
  const path = relativePath.trim().replace(/^\/+/, "");

  if (!isUUID(organization)) {
    throw new Error("No se pudo resolver una organización válida para Storage.");
  }
  if (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(
      "La ruta de Storage debe ser relativa y no puede contener . ni .. ni segmentos vacíos.",
    );
  }

  return `${organization}/${path}`;
}
