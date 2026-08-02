/**
 * Identidad del usuario para el pie del sidebar y el menú de la barra
 * superior (R12 UI/UX Fase 2 — punto 1). Un solo lugar para derivar
 * iniciales legibles a partir del correo.
 */
export function getUserInitials(email?: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "LG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
