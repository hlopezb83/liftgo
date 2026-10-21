// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { downloadExistingSupport, readBoundedStream, resolveSupportPath, validateSupportBytes } from "../downloadExisting";
import type { DocumentCandidate } from "../documentCandidates";
const mocks = vi.hoisted(() => ({ info: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: mocks.from } } }));
const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const candidate: DocumentCandidate = { kind: "Factura", id: "invoice", folio: "F1", uuid: "TEST-UUID", extension: "xml", bucket: "cfdi-files", source: `${org}/invoice/document.xml`, scope: "Periodo" };
const encode = (s: string) => new TextEncoder().encode(s);
const xml = '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="TEST-UUID"/></cfdi:Complemento></cfdi:Comprobante>';
beforeEach(() => { vi.clearAllMocks(); mocks.from.mockReturnValue({ info: mocks.info, download: mocks.download }); });
it("resolves only same-origin/bucket/organization paths and drops legacy token", () => {
  expect(resolveSupportPath(`https://project.supabase.co/storage/v1/object/sign/cfdi-files/${org}/i/f.xml?token=SECRET`, "cfdi-files", org, "https://project.supabase.co")).toBe(`${org}/i/f.xml`);
  expect(resolveSupportPath(candidate.source ?? "", "cfdi-files", org, undefined)).toBe(candidate.source);
  for (const source of [`https://project.supabase.co/storage/v1/object/sign/cfdi-files/${org}/a/%2e%2e/f.xml`, `https://project.supabase.co/storage/v1/object/sign/other/${org}/f.xml`, `https://evil.test/storage/v1/object/sign/cfdi-files/${org}/i/f.xml`, `${org}/../x`, `${org}/%2e%2e/x`, `${org}/%252e%252e/x`, `${org}/a%2fb/x`, `${org}/a\\b`, `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/i/f.xml`, "invoice/f.xml", `//host/${org}/x`, `data:text/xml,xxx`])
    expect(() => resolveSupportPath(source, "cfdi-files", org, "https://project.supabase.co")).toThrow("No verificable");
});
it("validates XML namespace/UUID, rejects HTML, entities, mismatched MIME and wrong PDF bytes", () => {
  expect(() => validateSupportBytes(encode(xml), candidate, "application/xml")).not.toThrow();
  for (const content of ["<html>error</html>", xml.replace("TEST-UUID", "OTHER"), '<!DOCTYPE a [<!ENTITY x SYSTEM "https://evil.test">]>' + xml, "<Comprobante/>"])
    expect(() => validateSupportBytes(encode(content), candidate, "application/xml")).toThrow();
  expect(() => validateSupportBytes(encode(xml), candidate, "text/html")).toThrow();
  const pdf = { ...candidate, extension: "pdf" as const };
  expect(() => validateSupportBytes(encode("%PDF-1.7\nfixture\n%%EOF"), pdf, "application/pdf")).not.toThrow();
  expect(() => validateSupportBytes(encode("<html>403</html>"), pdf, "application/pdf")).toThrow();
});
it("uses persisted XML without any Storage or PAC call", async () => {
  const bytes = await downloadExistingSupport({ ...candidate, inlineXml: xml }, org, 1024, new AbortController().signal);
  expect(new TextDecoder().decode(bytes)).toBe(xml); expect(mocks.from).not.toHaveBeenCalled();
});
it("rejects metadata oversize before downloading, and never leaks raw Storage errors", async () => {
  mocks.info.mockResolvedValue({ data: { size: 50 }, error: null });
  await expect(downloadExistingSupport(candidate, org, 10, new AbortController().signal)).rejects.toThrow("Límite excedido");
  expect(mocks.download).not.toHaveBeenCalled();
  mocks.info.mockResolvedValue({ data: null, error: { message: "token=SECRET" } });
  await expect(downloadExistingSupport(candidate, org, 10, new AbortController().signal)).rejects.toThrow("Sin acceso o no disponible");
});
it("reads Storage authenticated stream with cancellation signal and validates bytes", async () => {
  mocks.info.mockResolvedValue({ data: { size: xml.length, contentType: "application/xml", version: "v1" }, error: null });
  mocks.download.mockReturnValue({ asStream: () => Promise.resolve({ data: new ReadableStream({ start(c) { c.enqueue(encode(xml)); c.close(); } }), error: null }) });
  const controller = new AbortController();
  expect(new TextDecoder().decode(await downloadExistingSupport(candidate, org, 1024, controller.signal))).toBe(xml);
  expect(mocks.download).toHaveBeenCalledWith(candidate.source, { versionId: "v1" }, { signal: controller.signal });
});
it("cancels reader at byte limit and while waiting for a chunk", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4)); }, cancel });
  await expect(readBoundedStream(stream, 3, new AbortController().signal)).rejects.toThrow("Límite excedido"); expect(cancel).toHaveBeenCalled();
  const controller = new AbortController(); const cancel2 = vi.fn();
  const waiting = readBoundedStream(new ReadableStream({ cancel: cancel2 }), 3, controller.signal);
  controller.abort(); await expect(waiting).rejects.toThrow(); expect(cancel2).toHaveBeenCalled();
});
it("cancellation during nonabortable info never starts a late download", async () => {
  let resolve!: (value: unknown) => void;
  mocks.info.mockReturnValue(new Promise((done) => { resolve = done; }));
  const controller = new AbortController();
  const pending = downloadExistingSupport(candidate, org, 1000, controller.signal);
  controller.abort(); await expect(pending).rejects.toThrow();
  resolve({ data: { size: 10 }, error: null }); await Promise.resolve();
  expect(mocks.download).not.toHaveBeenCalled();
});
