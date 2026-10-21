/** No truncation. Keyset cursors remain stable when older rows are inserted/deleted. */
export async function collectPages<T extends { id: string }>(
  fetch: (after: string | null, limit: number) => Promise<{ data: T[] | null; error: unknown }>,
  signal: AbortSignal,
  size = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Tamaño de página inválido.");
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    signal.throwIfAborted();
    const { data, error } = await fetch(after, size);
    signal.throwIfAborted();
    if (error) throw error;
    const page = data ?? [];
    if (page.length > size) throw new Error("Respuesta de paginación inesperada.");
    for (const row of page) {
      if (!row.id || (after && row.id <= after)) throw new Error("Los datos cambiaron o la paginación no es estable. Vuelve a exportar.");
      after = row.id;
      rows.push(row);
    }
    if (page.length < size) return rows;
  }
}
