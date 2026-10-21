import { webcrypto } from "node:crypto";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { buildAccountantPackage, PACKAGE_LIMITS, saveAccountantPackage } from "../buildPackage";
import { documentCandidates } from "../documentCandidates";
import { SupportError } from "../downloadExisting";
import type { ExportData, ExportOptions, ExportSheet, Invoice } from "../model";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.restoreAllMocks());
const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const options: ExportOptions = { organizationId: org, start: "2026-10-01", end: "2026-10-31", sections: { sales: true, purchases: false, expenses: false }, includeDrafts: false, includeTest: false, includeDocuments: true };
const invoice = (id: string): Invoice => ({ id, invoice_number: "../../=Folio", cfdi_uuid: null, cfdi_xml_url: `${org}/${id}/a.xml`, cfdi_pdf_url: `${org}/${id}/a.pdf` } as Invoice);
const data = (): ExportData => ({ invoices: [invoice("a"), invoice("filtered-out")], credits: [], payments: [], bills: [], supplierPayments: [], expenses: [], invoiceReferences: [], billReferences: [], startedAt: "2026-10-21T04:00:00Z", finishedAt: "2026-10-21T04:01:00Z" });
const sheets = (): ExportSheet[] => [{ name: "Control", rows: [{ Concepto: "Archivos", Valor: "Esta entrega contiene Excel, no XML/PDF adjuntos" }] }, { name: "Ventas", rows: [{ ID: "a", Folio: "=notformula" }] }];
it("selects only IDs actually in workbook and not raw filtered-out rows", () => {
  expect(documentCandidates(data(), sheets()).map((c) => c.id)).toEqual(["a", "a"]);
});
it("packages same workbook and sanitized manifests, marks partial and never exports source URLs", async () => {
  const result = await buildAccountantPackage(options, data(), sheets(), new AbortController().signal, undefined, async (candidate) => {
    if (candidate.extension === "pdf") throw new SupportError("Faltante");
    return new TextEncoder().encode("stored XML bytes");
  });
  expect(result).toMatchObject({ incomplete: true, included: 1, missing: 1 });
  const archive = unzipSync(result.bytes);
  expect(Object.keys(archive)).toContain("informacion-contador.xlsx");
  expect(Object.keys(archive).filter((name) => name.startsWith("soportes/"))).toHaveLength(1);
  expect(Object.keys(archive).every((name) => !name.includes("..") && !name.includes("="))).toBe(true);
  const manifest = new TextDecoder().decode(archive["indice-archivos.json"]);
  expect(manifest).not.toContain(`${org}/a/a.xml`); expect(manifest).not.toContain("token=");
  expect(JSON.parse(manifest).archivos[0].SHA256).toMatch(/^[0-9a-f]{64}$/);
  const XLSX = await import("@e965/xlsx"); const workbook = XLSX.read(archive["informacion-contador.xlsx"], { type: "array" });
  expect(workbook.SheetNames).toContain("Archivos");
  expect(JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets.Control))).not.toContain("no XML/PDF adjuntos");
  expect(JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets.Control))).toContain("ZIP con este Excel");
  const row = XLSX.utils.sheet_to_json(workbook.Sheets.Ventas)[0] as { Folio: string };
  expect(row.Folio).toBe("=notformula");
  expect(Object.values(workbook.Sheets.Ventas).some((cell) => typeof cell === "object" && cell !== null && "f" in cell)).toBe(false);
});
it("rejects file count before any Storage/download work, never truncates", async () => {
  const dataset = data(); dataset.invoices = Array.from({ length: PACKAGE_LIMITS.files / 2 + 1 }, (_, i) => invoice(String(i)));
  const report = [{ name: "Ventas", rows: dataset.invoices.map((i) => ({ ID: i.id })) }];
  const load = vi.fn();
  await expect(buildAccountantPackage(options, dataset, report, new AbortController().signal, undefined, load)).rejects.toThrow("No se descargó");
  expect(load).not.toHaveBeenCalled();
});
it("aborts package without producing archive, including a late loader result", async () => {
  const controller = new AbortController();
  await expect(buildAccountantPackage(options, data(), sheets(), controller.signal, undefined, async () => { controller.abort(); return new Uint8Array(2); })).rejects.toThrow();
});
it("names incomplete download explicitly and blocks stale saves", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  const result = { bytes: new Uint8Array(1), incomplete: true, included: 0, missing: 2 };
  const element = document.createElement("a"); vi.spyOn(document, "createElement").mockReturnValueOnce(element);
  await saveAccountantPackage(result, "contador", () => true); expect(element.download).toBe("contador-INCOMPLETO.zip");
  await expect(saveAccountantPackage(result, "contador", () => false)).rejects.toThrow("contexto"); expect(create).toHaveBeenCalledTimes(1);
  click.mockRestore(); create.mockRestore();
});

it("processes cancellation queued during ZIP assembly before saving", async () => {
  let current = true;
  const create = vi.spyOn(URL, "createObjectURL");
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  // Equivalent to a Cancel task queued while synchronous CRC/assembly holds the event loop.
  setTimeout(() => { current = false; }, 0);
  await expect(saveAccountantPackage({ bytes: new Uint8Array(1), incomplete: false, included: 1, missing: 0 }, "queued", () => current)).rejects.toThrow("contexto");
  expect(create).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
