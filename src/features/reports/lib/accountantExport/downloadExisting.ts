import { supabase } from "@/integrations/supabase/client";
import type { DocumentCandidate } from "./documentCandidates";

export class SupportError extends Error {
  constructor(public readonly reason: "Faltante" | "No verificable" | "Sin acceso o no disponible" | "Formato inválido" | "Límite excedido" | "Error de lectura") { super(reason); }
}

/** Never follow persisted URLs. Resolve only the configured project, expected bucket and current tenant. */
export function resolveSupportPath(source: string, bucket: string, organizationId: string, baseUrl: string | undefined): string {
  let segments: string[];
  try {
    // URL normalizes dot segments; reject them before parsing to avoid accepting traversal syntax.
    if (source.includes("\\") || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(source)) throw new Error();
    if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
      if (!baseUrl) throw new Error();
      const url = new URL(source), base = new URL(baseUrl);
      if (url.origin !== base.origin || url.username || url.password || url.protocol !== "https:") throw new Error();
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucket) throw new Error();
      segments = match[2].split("/").map(decodeURIComponent);
    } else segments = source.split("/").map(decodeURIComponent);
    if (segments.some((s) => !s || s === "." || s === ".." || /[/\\%?#]/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) throw new Error();
    if (segments[0].toLowerCase() !== organizationId.toLowerCase()) throw new Error();
    return segments.join("/");
  } catch { throw new SupportError("No verificable"); }
}

function validateXml(bytes: Uint8Array, candidate: DocumentCandidate): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new SupportError("Formato inválido");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length || xml.documentElement.localName !== "Comprobante" ||
    !["http://www.sat.gob.mx/cfd/3", "http://www.sat.gob.mx/cfd/4"].includes(xml.documentElement.namespaceURI ?? "")) throw new SupportError("Formato inválido");
  if (candidate.uuid) {
    const stamp = xml.getElementsByTagNameNS("http://www.sat.gob.mx/TimbreFiscalDigital", "TimbreFiscalDigital")[0];
    if (stamp?.getAttribute("UUID")?.toLowerCase() !== candidate.uuid.toLowerCase()) throw new SupportError("Formato inválido");
  }
}

export function validateSupportBytes(bytes: Uint8Array, candidate: DocumentCandidate, mime?: string): void {
  const type = mime?.split(";")[0].trim().toLowerCase() ?? "";
  const generic = type === "" || type === "application/octet-stream";
  if (candidate.extension === "pdf") {
    const header = new TextDecoder().decode(bytes.subarray(0, 8));
    const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
    if ((!generic && type !== "application/pdf") || !/^%PDF-[12]\.\d/.test(header) || !tail.includes("%%EOF")) throw new SupportError("Formato inválido");
  } else {
    if (!generic && !["application/xml", "text/xml"].includes(type)) throw new SupportError("Formato inválido");
    validateXml(bytes, candidate);
  }
}

/** Race non-abortable SDK metadata against cancellation; late results cannot start a download. */
function cancellable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function readBoundedStream(stream: ReadableStream<Uint8Array>, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new SupportError("Límite excedido"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}

export async function downloadExistingSupport(candidate: DocumentCandidate, organizationId: string, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (candidate.extension === "xml" && candidate.inlineXml) {
    // The exact persisted XML arrived in the authorized row, not from the PAC.
    const bytes = new TextEncoder().encode(candidate.inlineXml);
    if (bytes.byteLength > maximum) throw new SupportError("Límite excedido");
    validateSupportBytes(bytes, candidate, "application/xml"); return bytes;
  }
  if (!candidate.source) throw new SupportError("Faltante");
  const path = resolveSupportPath(candidate.source, candidate.bucket, organizationId, import.meta.env.VITE_SUPABASE_URL);
  const storage = supabase.storage.from(candidate.bucket);
  const { data: info, error: infoError } = await cancellable(storage.info(path), signal);
  signal.throwIfAborted();
  if (infoError || !info) throw new SupportError("Sin acceso o no disponible");
  if (typeof info.size === "number" && info.size > maximum) throw new SupportError("Límite excedido");
  const { data: stream, error } = await storage.download(path, info.version ? { versionId: info.version } : undefined, { signal }).asStream();
  signal.throwIfAborted();
  if (error || !stream) throw new SupportError("Sin acceso o no disponible");
  const bytes = await readBoundedStream(stream, maximum, signal);
  validateSupportBytes(bytes, candidate, info.contentType);
  return bytes;
}
