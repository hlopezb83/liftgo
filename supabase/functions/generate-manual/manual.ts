// Multiempresa · el manual de usuario es POR ORGANIZACIÓN.
//
// Se extrae de index.ts para poder probar sin red: el cálculo del consecutivo
// y el insert reciben un cliente inyectable y una organización ya resuelta
// desde `organization_memberships` (nunca del payload).

export interface ManualClientLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface ManualInsertResult {
  ok: boolean;
  status: number;
  message?: string;
  version?: string;
  manual?: unknown;
}

/**
 * Siguiente versión mayor del manual DENTRO de la organización indicada.
 * El manual de otra empresa nunca influye en este consecutivo.
 */
export async function nextManualVersion(
  client: ManualClientLike,
  organizationId: string,
): Promise<{ ok: true; version: string } | { ok: false; message: string }> {
  if (!organizationId) {
    return { ok: false, message: "Organización no resuelta" };
  }
  const res = await client
    .from("user_manual")
    .select("version")
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((res as { error?: unknown })?.error) {
    // Fail-closed: sin lectura confiable no se folía una versión nueva.
    return { ok: false, message: "No se pudo calcular la versión del manual" };
  }
  const latest = (res as { data?: { version?: string | null } | null })?.data;
  const current = latest?.version ?? null;
  if (!current) return { ok: true, version: "1.0" };
  const major = parseInt(String(current).split(".")[0], 10);
  return { ok: true, version: `${(isNaN(major) ? 0 : major) + 1}.0` };
}

/** Inserta el manual con `organization_id` explícito de la organización del caller. */
export async function insertManual(
  client: ManualClientLike,
  organizationId: string,
  sections: unknown,
): Promise<ManualInsertResult> {
  const version = await nextManualVersion(client, organizationId);
  if (!version.ok) return { ok: false, status: 500, message: version.message };

  const now = new Date().toISOString();
  const res = await client
    .from("user_manual")
    .insert({
      organization_id: organizationId,
      version: version.version,
      content: sections,
      generated_at: now,
      updated_at: now,
    })
    .select()
    .single();

  const error = (res as { error?: { message?: string } | null })?.error;
  if (error) {
    console.error("Insert error:", error);
    return { ok: false, status: 500, message: "Error al guardar el manual" };
  }
  return {
    ok: true,
    status: 200,
    version: version.version,
    manual: (res as { data?: unknown })?.data,
  };
}
