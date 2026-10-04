/** Storage oculta objetos ajenos como inexistentes; otros errores deben fallar. */
export function isStorageDenial(
  error: { message: string; status?: number; statusCode?: string | number } | null,
  operation: "read" | "write",
): boolean {
  if (!error) return false;
  const status = Number(error.statusCode ?? error.status);
  if (operation === "write") {
    return [400, 403].includes(status) && /row-level security|permission denied|unauthorized/i.test(error.message);
  }
  return ([400, 404].includes(status) && /object not found|not found|not_found/i.test(error.message))
    || (status === 403 && /permission denied|unauthorized|access denied/i.test(error.message));
}
