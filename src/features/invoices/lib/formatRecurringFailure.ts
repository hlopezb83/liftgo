/**
 * Convierte cualquier error recibido de la generación recurrente en texto
 * legible. Evita mostrar "[object Object]" cuando el servidor envía un objeto.
 */
export function formatRecurringFailure(error: unknown): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed && trimmed !== "[object Object]" ? trimmed : "Error sin detalle";
  }
  if (error instanceof Error) return error.message || "Error sin detalle";
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts: string[] = [];
    if (e["message"] !== undefined) parts.push(formatRecurringFailure(e["message"]));
    for (const key of ["details", "hint"] as const) {
      if (typeof e[key] === "string" && e[key]) parts.push(String(e[key]));
    }
    if (typeof e["code"] === "string" && e["code"]) parts.push(`(código ${e["code"]})`);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Error sin detalle";
    }
  }
  return error == null ? "Error sin detalle" : String(error);
}
