import Facturapi from "facturapi6-preview";
interface Transport { request(path: string, options?: Record<string, unknown>): Promise<unknown> }
interface Resource { client: Transport; me(): Promise<unknown> }
/** Same isolated transport technique as reviewed Deno preflight, npm ESM runtime. */
export async function readSdk6Issuer(key: string, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const sdk = new Facturapi(key);
  const resource = sdk.organizations as unknown as Resource;
  const transport = resource.client;
  if (typeof resource.me !== "function" || typeof transport?.request !== "function") throw new Error("sdk_contract");
  const scopedTransport: Transport = Object.create(transport);
  scopedTransport.request = (path, options = {}) => {
    signal.throwIfAborted();
    if (path !== "/organizations/me" || options.method !== "GET") throw new Error("read_only_contract");
    return transport.request(path, { ...options, signal, redirect: "error", cache: "no-store" });
  };
  const scoped: Resource = Object.create(resource);
  scoped.client = scopedTransport;
  return resource.me.call(scoped);
}
