import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseResult } from "../../lib/bankParseUtils";
import type { XmlParseResult } from "../../lib/xmlParsers";

const { importMutateMock, notifyErrorMock, parseBankCsvMock, parseBankXmlMock } = vi.hoisted(() => ({
  importMutateMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  parseBankCsvMock: vi.fn(),
  parseBankXmlMock: vi.fn(),
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notifyInfo: vi.fn(),
  notifyValidation: vi.fn(),
}));

vi.mock("../../lib/csvParsers", () => ({
  parseBankCsv: (...args: unknown[]) => parseBankCsvMock(...args),
}));
vi.mock("../../lib/xmlParsers", () => ({
  parseBankXml: (...args: unknown[]) => parseBankXmlMock(...args),
}));
vi.mock("../useBankReconciliationMutations", () => ({
  useImportBankStatement: () => ({ mutate: importMutateMock, isPending: false }),
}));

import { MAX_FILE_SIZE_BYTES, MAX_PARSED_LINES, useStatementUpload } from "../useStatementUpload";

function fakeFile(size: number, name = "estado.csv", content = "fecha,monto\n2026-01-01,100\n") {
  const file = new File([content], name, { type: name.endsWith(".xml") ? "text/xml" : "text/csv" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function line(index: number, description = `mov ${index}`) {
  return {
    posted_date: "2026-01-01",
    description,
    signed_amount: 1,
    reference: String(index),
    line_seq: index,
    hash: `h${index}`,
    occurrence: 1,
  };
}

function result(description = "mov 1"): ParseResult {
  return {
    lines: [line(1, description)],
    errors: [],
    periodStart: "2026-01-01",
    periodEnd: "2026-01-01",
  };
}

function xmlResult(description: string): XmlParseResult {
  return {
    ...result(description),
    detectedMapping: { date: "fecha", amount: "monto" },
    availableFields: ["fecha", "fecha_alt", "monto"],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useStatementUpload · límites, identidad y carreras", () => {
  beforeEach(() => {
    importMutateMock.mockReset();
    notifyErrorMock.mockReset();
    parseBankCsvMock.mockReset();
    parseBankXmlMock.mockReset();
    localStorage.clear();
  });

  it("rechaza archivos de más de 10 MB sin leer su contenido", async () => {
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(fakeFile(MAX_FILE_SIZE_BYTES + 1)));
    await act(async () => { await hook.current.analyze(); });
    expect(parseBankCsvMock).not.toHaveBeenCalled();
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Archivo demasiado grande" }),
    );
    expect(hook.current.preview).toBeNull();
  });

  it("rechaza más de 50,000 movimientos y descarta la vista previa", async () => {
    parseBankCsvMock.mockResolvedValue({
      lines: Array.from({ length: MAX_PARSED_LINES + 1 }, (_, index) => line(index)),
      errors: [],
      periodStart: "2026-01-01",
      periodEnd: "2026-01-01",
    });
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(fakeFile(1_024)));
    await act(async () => { await hook.current.analyze(); });
    await waitFor(() => expect(hook.current.preview).toBeNull());
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Archivo con demasiados movimientos" }),
    );
    expect(parseBankCsvMock).toHaveBeenCalledWith(expect.any(String), "generico", MAX_PARSED_LINES);
  });

  it("acepta un archivo normal y conserva la vista previa", async () => {
    parseBankCsvMock.mockResolvedValue({
      ...result(),
      lines: [line(1), line(2)],
    });
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(fakeFile(2_048)));
    await act(async () => { await hook.current.analyze(); });
    await waitFor(() => expect(hook.current.preview?.lines).toHaveLength(2));
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("expone estado de análisis e ignora una segunda ejecución concurrente", async () => {
    const parse = deferred<ParseResult>();
    parseBankCsvMock.mockReturnValue(parse.promise);
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(fakeFile(2_048)));

    let firstRun!: Promise<void>;
    act(() => { firstRun = hook.current.analyze(); });
    await waitFor(() => expect(hook.current.isAnalyzing).toBe(true));

    await act(async () => { await hook.current.analyze(); });
    expect(parseBankCsvMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      parse.resolve(result());
      await firstRun;
    });
    expect(hook.current.isAnalyzing).toBe(false);
  });

  it("descarta el resultado tardío de A si el archivo cambia a B", async () => {
    const parseA = deferred<ParseResult>();
    parseBankCsvMock.mockReturnValueOnce(parseA.promise).mockResolvedValueOnce(result("archivo B"));
    const fileA = fakeFile(1_024, "a.csv");
    const fileB = fakeFile(1_024, "b.csv");
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(fileA));

    let analyzeA!: Promise<void>;
    act(() => { analyzeA = hook.current.analyze(); });
    await waitFor(() => expect(hook.current.isAnalyzing).toBe(true));
    act(() => hook.current.setFile(fileB));
    await act(async () => {
      parseA.resolve(result("archivo A"));
      await analyzeA;
    });

    expect(hook.current.file).toBe(fileB);
    expect(hook.current.preview).toBeNull();
    expect(notifyErrorMock).not.toHaveBeenCalled();

    await act(async () => { await hook.current.analyze(); });
    expect(hook.current.preview?.lines[0]?.description).toBe("archivo B");
  });

  it("sólo publica el remapeo XML más reciente aunque el anterior termine después", async () => {
    parseBankXmlMock.mockResolvedValueOnce(xmlResult("inicial"));
    const xml = fakeFile(1_024, "estado.xml", "<movimientos />");
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(xml));
    await act(async () => { await hook.current.analyze(); });
    expect(hook.current.preview?.lines[0]?.description).toBe("inicial");

    const first = deferred<XmlParseResult>();
    const second = deferred<XmlParseResult>();
    parseBankXmlMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => hook.current.remap({ date: "fecha" }));
    act(() => hook.current.remap({ date: "fecha_alt" }));

    await act(async () => { second.resolve(xmlResult("segundo")); });
    await waitFor(() => expect(hook.current.preview?.lines[0]?.description).toBe("segundo"));
    expect(hook.current.mapping.date).toBe("fecha_alt");

    await act(async () => { first.resolve(xmlResult("primero tardío")); });
    expect(hook.current.preview?.lines[0]?.description).toBe("segundo");
    expect(hook.current.mapping.date).toBe("fecha_alt");
  });

  it("conserva el uploadId al reintentar la confirmación del mismo análisis", async () => {
    parseBankCsvMock.mockResolvedValue(result());
    const file = fakeFile(2_048);
    const { result: hook } = renderHook(() => useStatementUpload("acc-1"));
    act(() => hook.current.setFile(file));
    await act(async () => { await hook.current.analyze(); });

    act(() => hook.current.confirm());
    act(() => hook.current.confirm());

    expect(importMutateMock).toHaveBeenCalledTimes(2);
    const firstArgs = importMutateMock.mock.calls[0]?.[0];
    const retryArgs = importMutateMock.mock.calls[1]?.[0];
    expect(firstArgs.uploadId).toEqual(expect.any(String));
    expect(retryArgs.uploadId).toBe(firstArgs.uploadId);
    expect(firstArgs).toEqual(expect.objectContaining({
      bankAccountId: "acc-1",
      fileName: file.name,
      lines: result().lines,
    }));
  });
});
