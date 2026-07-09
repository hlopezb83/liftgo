/**
 * Helper tipado para obtener el próximo número de documento vía RPC.
 *
 * Reemplaza el patrón inline `supabase.rpc("next_*_number")` que se repite en
 * `useInvoices`, `useContracts`, `useQuotes`, `useCreditNoteMutations`.
 *
 * Se apoya en `callRpc` (que ya maneja el narrowing seguro del tipo `Json`
 * generado por Supabase) para exponer una firma clara y consistente.
 */
import { callRpc } from "@/lib/rpc";
import type { Database } from "@/integrations/supabase/types";

type RpcName = keyof Database["public"]["Functions"];

/**
 * Los nombres de RPCs de numeración siguen la convención `next_<algo>_number`.
 * Extraemos ese subconjunto de la unión total para dar autocomplete y evitar
 * llamadas equivocadas.
 */
export type NextDocNumberRpc = Extract<RpcName, `next_${string}_number`>;

/**
 * Ejecuta una RPC de numeración de documento y devuelve el string generado.
 * Lanza si la RPC devuelve error o un valor no-string.
 */
export async function fetchNextDocNumber(rpc: NextDocNumberRpc): Promise<string> {
  const value = await callRpc<unknown>(rpc);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`RPC ${rpc} devolvió un valor inválido: ${JSON.stringify(value)}`);
  }
  return value;
}
