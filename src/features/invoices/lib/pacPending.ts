/** A 202 from Facturapi means the document exists remotely but awaits a UUID. */
export function isPacPending(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "PAC_PENDING" ||
    (error instanceof Error && /timbrado pendiente de resoluci[oó]n/i.test(error.message));
}
