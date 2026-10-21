import { documentCandidates, type DocumentCandidate } from "./documentCandidates";
import { downloadExistingSupport, SupportError } from "./downloadExisting";
import { createAccountantWorkbook } from "./writeWorkbook";
import type { ExportData, ExportOptions, ExportRow, ExportSheet } from "./model";

export const PACKAGE_LIMITS = { files: 500, fileBytes: 10 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 } as const;
type Loader = (candidate: DocumentCandidate, organizationId: string, maximum: number, signal: AbortSignal) => Promise<Uint8Array>;
export interface PackageResult { bytes: Uint8Array; incomplete: boolean; included: number; missing: number }
const safe = (value: string) => value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "sin_folio";

/** A single extraction supplies workbook and supports. No second document query or PAC access. */
export async function buildAccountantPackage(options: ExportOptions, data: ExportData, sheets: ExportSheet[], signal: AbortSignal,
  onProgress?: (done: number, total: number) => void, load: Loader = downloadExistingSupport): Promise<PackageResult> {
  signal.throwIfAborted();
  if (!options.includeDocuments) throw new Error("Los soportes no fueron solicitados en esta extracción.");
  const candidates = documentCandidates(data, sheets);
  if (candidates.length > PACKAGE_LIMITS.files) throw new Error(`El paquete requiere ${candidates.length} archivos y supera el máximo de ${PACKAGE_LIMITS.files}. Reduce el periodo o las secciones. No se descargó un paquete truncado.`);
  const entries: Record<string, Uint8Array> = {};
  const manifest: ExportRow[] = [];
  let total = 0, included = 0;
  for (const [index, candidate] of candidates.entries()) {
    signal.throwIfAborted();
    const base = { Tipo: candidate.kind, "Documento ID": candidate.id, Folio: candidate.folio, UUID: candidate.uuid, Alcance: candidate.scope, Formato: candidate.extension.toUpperCase() };
    const name = `soportes/${safe(candidate.kind)}/${safe(candidate.folio)}-${safe(candidate.id)}-${index + 1}.${candidate.extension}`;
    try {
      if (total >= PACKAGE_LIMITS.totalBytes) throw new SupportError("Límite excedido");
      const bytes = await load(candidate, options.organizationId, Math.min(PACKAGE_LIMITS.fileBytes, PACKAGE_LIMITS.totalBytes - total), signal);
      signal.throwIfAborted();
      if (bytes.byteLength > PACKAGE_LIMITS.fileBytes || total + bytes.byteLength > PACKAGE_LIMITS.totalBytes) throw new SupportError("Límite excedido");
      const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
      signal.throwIfAborted();
      entries[name] = bytes; total += bytes.byteLength; included++;
      manifest.push({ ...base, Estado: "Incluido", Archivo: name, Bytes: bytes.byteLength, SHA256: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("") });
    } catch (cause) {
      signal.throwIfAborted();
      manifest.push({ ...base, Estado: cause instanceof SupportError ? cause.reason : "Error de lectura", Archivo: null, Bytes: null, SHA256: null });
    }
    onProgress?.(index + 1, candidates.length);
  }
  const missing = candidates.length - included;
  const summary = { formato: "LiftGO paquete operativo v1", empresa: options.organizationId, desde: options.start, hasta: options.end,
    extraccionInicioUTC: data.startedAt, extraccionFinUTC: data.finishedAt, completo: missing === 0,
    incluidos: included, noIncluidos: missing, limiteArchivos: PACKAGE_LIMITS.files, limiteBytesPorArchivo: PACKAGE_LIMITS.fileBytes,
    limiteBytesSoportes: PACKAGE_LIMITS.totalBytes, criterio: "Sólo documentos existentes y autorizados. Extracción operativa, no cierre contable ni recuperación del PAC.", archivos: manifest };
  const packageSheets = sheets.map((sheet) => sheet.name === "Control" ? { ...sheet, rows: [...sheet.rows.filter((row) => row.Concepto !== "Archivos"),
    { Concepto: "Archivos", Valor: "ZIP con este Excel y soportes existentes autorizados; consultar hoja Archivos para alcance y no incluidos." },
    { Concepto: "Paquete de soportes", Valor: missing ? "INCOMPLETO: revisar hoja Archivos" : "Todos los archivos candidatos incluidos" },
    { Concepto: "Archivos incluidos", Valor: included }, { Concepto: "Archivos no incluidos", Valor: missing },
    { Concepto: "Límites de soportes", Valor: "500 archivos; 10 MiB por archivo; 100 MiB acumulados. No se recuperan archivos del PAC." },
  ] } : sheet);
  packageSheets.push({ name: "Archivos", rows: manifest, headers: ["Tipo", "Documento ID", "Folio", "UUID", "Alcance", "Formato", "Estado", "Archivo", "Bytes", "SHA256"] });
  const workbook = await createAccountantWorkbook(packageSheets);
  const XLSX = await import("@e965/xlsx");
  entries["informacion-contador.xlsx"] = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  entries["indice-archivos.json"] = new TextEncoder().encode(JSON.stringify(summary, null, 2));
  signal.throwIfAborted();
  const { zip } = await import("fflate");
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    // Store-only avoids spending CPU recompressing PDFs/XLSX; fflate owns ZIP framing/CRC.
    let stop: () => void = () => undefined;
    const abort = () => { stop(); reject(signal.reason ?? new DOMException("Cancelled", "AbortError")); };
    stop = zip(entries, { level: 0 }, (error, result) => { signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(result); });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  return { bytes, incomplete: missing > 0, included, missing };
}

export async function saveAccountantPackage(result: PackageResult, filename: string, shouldSave: () => boolean): Promise<void> {
  // ZIP assembly can occupy the event loop; let queued Cancel/identity events run first.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!shouldSave()) throw new Error("El contexto cambió. Vuelve a exportar.");
  const url = URL.createObjectURL(new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: "application/zip" }));
  try {
    const a = document.createElement("a"); a.href = url; a.download = `${filename}${result.incomplete ? "-INCOMPLETO" : ""}.zip`; a.rel = "noopener"; a.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
