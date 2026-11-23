import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseResult } from "../../lib/bankParseUtils";
import { BankStatementUploader } from "../BankStatementUploader";

const upload = vi.hoisted(() => ({
  preview: null as ParseResult | null,
  confirm: vi.fn(), reset: vi.fn(), analyze: vi.fn(), setFile: vi.fn(), setProfile: vi.fn(),
  file: null, profile: "generic", xmlFields: [], mapping: {}, remap: vi.fn(),
  isAnalyzing: false, isPending: false,
}));
vi.mock("../../hooks/useStatementUpload", () => ({
  useStatementUpload: () => upload,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
}));

const result: ParseResult = {
  lines: [{ posted_date: "2026-11-14", description: "Abono", signed_amount: 100,
    reference: "REF-1", line_seq: 1, hash: "hash-1", occurrence: 1 }],
  errors: ["Fila 2: fecha inválida", "Fila 3: importe inválido"],
  periodStart: "2026-11-14", periodEnd: "2026-11-14",
};

beforeEach(() => {
  upload.preview = result;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Revisión del estado de cuenta antes de importar", () => {
  it("descarta el archivo anterior si su reemplazo excede 10 MB y permite volver a elegir", () => {
    const { container } = render(<BankStatementUploader bankAccountId="account-1" currency="MXN" />);
    const fileInput = container.querySelector('input[type="file"]')!;
    const oversized = new File([], "grande.csv");
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });

    expect(screen.getByRole("button", { name: "Confirmar importación" })).toBeVisible();
    fireEvent.change(fileInput, { target: { files: [oversized] } });
    expect(upload.setFile).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("alert")).toHaveTextContent("El archivo supera 10 MB");
    expect(upload.confirm).not.toHaveBeenCalled();

    const replacement = new File(["fecha,importe"], "reemplazo.csv");
    fireEvent.change(fileInput, { target: { files: [replacement] } });
    expect(upload.setFile).toHaveBeenLastCalledWith(replacement);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["MXN", "USD"])("la vista previa conserva importes e identifica %s", (currency) => {
    render(<BankStatementUploader bankAccountId="account-1" currency={currency} />);
    const amounts = screen.getAllByText((text) => text.includes("100.00") && text.includes(currency));
    expect(amounts).toHaveLength(2);
    for (const amount of amounts) expect(amount.textContent?.match(new RegExp(currency, "g"))).toHaveLength(1);
    expect(screen.getByText((text) => /(?:^|\D)0\.00(?:\D|$)/.test(text) && text.includes(currency))).toBeInTheDocument();
    expect(upload.confirm).not.toHaveBeenCalled();
  });

  it.each([false, true])("muestra todos los errores sin importar al abrir o cerrar (archivo inválido=%s)", (allInvalid) => {
    upload.preview = { ...result, lines: allInvalid ? [] : result.lines };
    render(<BankStatementUploader bankAccountId="account-1" currency="MXN" />);
    const disclosure = screen.getByText("Ver 2 errores");
    fireEvent.click(disclosure);
    expect(screen.getByText(result.errors[0])).toBeVisible();
    expect(screen.getByText(result.errors[1])).toBeVisible();
    expect(screen.getByRole("region", { name: "Errores del archivo" })).toHaveClass("max-h-48", "overflow-y-auto");
    fireEvent.click(disclosure);
    expect(disclosure).toBeVisible();
    expect(upload.confirm).not.toHaveBeenCalled();

    if (allInvalid) {
      expect(screen.queryByRole("button", { name: "Confirmar importación" })).not.toBeInTheDocument();
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
      expect(upload.confirm).toHaveBeenCalledOnce();
    }
  });
});
