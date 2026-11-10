import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  createInvoiceWithSignal,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

export interface InvoiceGatewayResult {
  id: string;
  uuid?: string;
  status?: string;
  series?: string | null;
  folio_number?: number | string | null;
  total?: number;
}

/** Only the PAC operations used by CFDI-I. No claims, SQL or retry policy for creation. */
export interface InvoiceGateway {
  create(
    payload: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<InvoiceGatewayResult>;
  downloadXml(id: string): Promise<string>;
  downloadPdf(id: string): Promise<Uint8Array>;
}

/** Preserve SDK signal forwarding, binary decoding and existing download retries. */
export function createInvoiceGateway(apiKey: string): InvoiceGateway {
  const client = createFacturapiClient(apiKey);
  return {
    create: (payload, options) =>
      createInvoiceWithSignal(client, payload, options),
    downloadXml: async (id) =>
      await binaryToText(
        await retryOnFacturapi5xx(() => client.invoices.downloadXml(id)),
      ),
    downloadPdf: async (id) =>
      await binaryToBytes(
        await retryOnFacturapi5xx(() => client.invoices.downloadPdf(id)),
      ),
  };
}
