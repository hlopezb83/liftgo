import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fix 6.3 (Sprint 6): el importador de estados de cuenta rechaza archivos
 * mayores a 10 MB y archivos con más de 50,000 movimientos, en vez de
 * congelar la pestaña al parsearlos/renderizarlos.
 */
const notifyErrorMock = vi.fn();

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notifyInfo: vi.fn(),
  notifyValidation: vi.fn(),
}));

const parseBankCsvMock = vi.fn();
vi.mock("../../lib/csvParsers", () => ({ parseBankCsv: (...a: unknown[]) => parseBankCsvMock(...a) }));
vi.mock("../../lib/xmlParsers", () => ({ parseBankXml: vi.fn() }));
vi.mock("../useBankReconciliationMutations", () => ({
  useImportBankStatement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { useStatementUpload, MAX_FILE_SIZE_BYTES, MAX_PARSED_LINES } from "../useStatementUpload";

function fakeFile(size: number, name = "estado.csv") {
  const file = new File(["fecha,monto\n"], name, { type: "text/csv" });
  Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(file, "text", { value: async () => "fecha,monto\n2026-01-01,100\n" });
  return file;
}

const line = (i: number) => ({
  postedDate: "2026-01-01",
  description: `mov ${i}`,
  amount: 1,
  reference: String(i),
  hash: `h${i}`,
});

describe("useStatementUpload · Fix 6.3 límites de archivo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechaza archivos de más de 10 MB sin leer su contenido", async () => {
    const { result } = renderHook(() => useStatementUpload("acc-1"));
    act(() => result.current.setFile(fakeFile(MAX_FILE_SIZE_BYTES + 1)));
    await act(async () => { await result.current.analyze(); });
    expect(parseBankCsvMock).not.toHaveBeenCalled();
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Archivo demasiado grande" }),
    );
    expect(result.current.preview).toBeNull();
  });

  it("rechaza archivos con más de 50,000 movimientos y descarta la vista previa", async () => {
    parseBankCsvMock.mockResolvedValue({
      lines: Array.from({ length: MAX_PARSED_LINES + 1 }, (_, i) => line(i)),
      errors: [],
    });
    const { result } = renderHook(() => useStatementUpload("acc-1"));
    act(() => result.current.setFile(fakeFile(1024)));
    await act(async () => { await result.current.analyze(); });
    await waitFor(() => expect(result.current.preview).toBeNull());
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Archivo con demasiados movimientos" }),
    );
  });

  it("acepta un archivo normal y conserva la vista previa", async () => {
    parseBankCsvMock.mockResolvedValue({ lines: [line(1), line(2)], errors: [] });
    const { result } = renderHook(() => useStatementUpload("acc-1"));
    act(() => result.current.setFile(fakeFile(2048)));
    await act(async () => { await result.current.analyze(); });
    await waitFor(() => expect(result.current.preview?.lines).toHaveLength(2));
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });
});
