import { retryOnFacturapi5xx } from "./client.ts";

export type PacLookup =
  | { kind: "hit"; facturapi_id: string; uuid: string }
  | { kind: "pending"; facturapi_id: string }
  | { kind: "failed"; facturapi_id: string }
  | { kind: "miss" }
  | { kind: "lookup_failed" };

interface InvoiceResource {
  list?: (query: Record<string, unknown>) => Promise<unknown>;
  retrieve?: (id: string) => Promise<unknown>;
}

/** Facturapi may accept an invoice with HTTP 202 and no UUID for up to six hours. */
export function classifyPacInvoice(value: unknown): PacLookup {
  if (!value || typeof value !== "object") return { kind: "lookup_failed" };
  const invoice = value as Record<string, unknown>;
  const id = invoice.id;
  if (typeof id !== "string" || !id) return { kind: "lookup_failed" };
  if (invoice.status === "pending") {
    return { kind: "pending", facturapi_id: id };
  }
  if (invoice.status === "failed") return { kind: "failed", facturapi_id: id };
  if (typeof invoice.uuid === "string" && invoice.uuid) {
    return { kind: "hit", facturapi_id: id, uuid: invoice.uuid };
  }
  // A valid invoice without a UUID is inconsistent. Never interpret it as absent.
  return { kind: "lookup_failed" };
}

/** Retrieve a known Facturapi ID first; list only when no ID was persisted. */
export async function lookupPacInvoice(
  client: { invoices: InvoiceResource },
  externalId: string,
  knownId: string | null,
): Promise<PacLookup> {
  const resource = client.invoices;
  if (knownId) {
    if (typeof resource.retrieve !== "function") {
      return { kind: "lookup_failed" };
    }
    const invoice = await retryOnFacturapi5xx(() =>
      resource.retrieve!.call(resource, knownId)
    );
    if ((invoice as { id?: unknown })?.id !== knownId) {
      return { kind: "lookup_failed" };
    }
    const remoteExternalId = (invoice as { external_id?: unknown }).external_id;
    if (remoteExternalId && remoteExternalId !== externalId) {
      return { kind: "lookup_failed" };
    }
    return classifyPacInvoice(invoice);
  }
  if (typeof resource.list !== "function") return { kind: "lookup_failed" };
  const response = await retryOnFacturapi5xx(() =>
    resource.list!.call(resource, { external_id: externalId, limit: 100 })
  );
  const data = (response as { data?: unknown })?.data;
  if (!Array.isArray(data)) return { kind: "lookup_failed" };
  const matches = data.filter((invoice) => invoice?.external_id === externalId);
  if (matches.length === 0) return { kind: "miss" };
  // Multiple remote invoices for one local document need human review.
  if (matches.length !== 1) return { kind: "lookup_failed" };
  return classifyPacInvoice(matches[0]);
}
