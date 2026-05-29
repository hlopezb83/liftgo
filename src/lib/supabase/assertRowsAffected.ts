/**
 * Verifica que una mutación de Supabase haya afectado al menos una fila.
 *
 * Cuando RLS filtra la fila objetivo, `.update()` / `.delete()` devuelven
 * `data: []` sin lanzar error, lo que provoca falsos positivos de "éxito".
 * Usa este helper junto con `.select(...)` para detectarlo y lanzar un
 * error real que el sistema global `notifyError` pueda mostrar con detalles.
 *
 * @example
 *   const { data, error } = await supabase
 *     .from("tabla")
 *     .update({ campo: valor })
 *     .eq("id", id)
 *     .select("id");
 *   if (error) throw error;
 *   assertRowsAffected(data, "Actualizar tabla");
 */
export function assertRowsAffected<T>(
  data: T[] | null,
  context: string,
): asserts data is T[] {
  if (!data || data.length === 0) {
    throw new Error(
      `${context}: no se modificó ningún registro. Verifica tus permisos o que el registro exista.`,
    );
  }
}
