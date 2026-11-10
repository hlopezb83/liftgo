/** Sólo helpers de revisión offline; no crea SDK, clientes, endpoints ni peticiones. */
export interface CallScope {
  checkpoint(): void;
  signal: AbortSignal;
}
type RequestOptions = Record<string, unknown>;
interface Resource {
  client: { request(path: string, options?: RequestOptions): Promise<unknown> };
  create(payload: Record<string, unknown>): Promise<unknown>;
  cancel(id: string, params: Record<string, unknown>): Promise<unknown>;
  retrieve(id: string): Promise<unknown>;
  updateStatus(id: string): Promise<unknown>;
  downloadPdf(id: string): Promise<unknown>;
  downloadXml(id: string): Promise<unknown>;
}
export interface OfficialClient { invoices: Resource }

/** Conserva métodos/serialización/fechas del SDK; sólo acota request y señal.
 * No reemplaza fetch ni crea HTTP alternativo. La vista resource.client es
 * una dependencia interna ya usada por la capa candidata: requiere revisión
 * y contrato versionado, no es una opción pública de inyección del SDK.
 */
export function prepareOfficialCalls(client: OfficialClient, scope: CallScope) {
  const check = () => { scope.checkpoint(); scope.signal.throwIfAborted(); };
  const original = client.invoices;
  if (typeof original?.client?.request !== "function") throw new Error("QA_TRANSPORT_BLOCKED");
  const transport = original.client;
  const scopedTransport = Object.create(transport) as Resource["client"];
  scopedTransport.request = async (path, options = {}) => {
    check();
    // Nunca ignorar una señal desconocida/cross-realm: fail-closed.
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
      throw new Error("QA_SIGNAL_INCOMPATIBLE");
    }
    const signal = options.signal instanceof AbortSignal
      ? AbortSignal.any([scope.signal, options.signal]) : scope.signal;
    signal.throwIfAborted();
    const response = await transport.request(path, { ...options, signal });
    check();
    signal.throwIfAborted();
    return response;
  };
  const invoices = Object.create(original) as Resource;
  invoices.client = scopedTransport;
  const call = async (operation: () => Promise<unknown>) => {
    check();
    const result = await operation();
    check();
    return result;
  };
  return {
    /** Únicamente para conectar una vista local a la copia QA, sin crear SDK. */
    invoices,
    create: (payload: Record<string, unknown>) => call(() => invoices.create(payload)),
    cancel: (id: string, params: Record<string, unknown>) => call(() => invoices.cancel(id, params)),
    retrieve: (id: string) => call(() => invoices.retrieve(id)),
    refresh: (id: string) => call(() => invoices.updateStatus(id)),
    pdf: (id: string) => call(() => invoices.downloadPdf(id)),
    xml: (id: string) => call(() => invoices.downloadXml(id)),
    /** Incluye consumo del cuerpo: el SDK puede devolver stream tras headers. */
    consume: async <T>(binary: unknown, reader: (value: unknown) => Promise<T>) => {
      check();
      const result = await reader(binary);
      check();
      return result;
    },
  };
}