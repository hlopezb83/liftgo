/**
 * Local typed contract for an RPC added by a NOT-YET-APPLIED reviewed migration
 * (qa/facturapi6-preview-preparation/sql/0134_qa_fx6_test_key_exclusive.sql).
 * No arguments: the key never leaves the database. Anything but literal true,
 * including an error or a missing function, is treated as not exclusive.
 */
export const EXCLUSIVITY_RPC = "qa_fx6_elogistix_test_key_is_exclusive" as const;
export interface ExclusivityRpc {
  rpc(name: typeof EXCLUSIVITY_RPC): PromiseLike<{ data: unknown; error: unknown }>;
}
export async function verifyElogistixTestKeyExclusive(client: ExclusivityRpc): Promise<boolean> {
  try {
    const result = await client.rpc(EXCLUSIVITY_RPC);
    return result.error == null && result.data === true;
  } catch { return false; }
}
