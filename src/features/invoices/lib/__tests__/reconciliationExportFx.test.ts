import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadReconciliationXlsx } from "../reconciliationExport";
import type { ReconciliationRow } from "../../hooks/reconciliation/useReconciliationData";
import type { WorkBook } from "@e965/xlsx";

const captured = vi.hoisted(() => ({ workbook: undefined as WorkBook | undefined }));
vi.mock("@e965/xlsx", async (importOriginal) => ({
  ...await importOriginal<typeof import("@e965/xlsx")>(),
  writeFile: (workbook: WorkBook) => { captured.workbook = workbook; },
}));

function invoice(overrides: Partial<ReconciliationRow> = {}): ReconciliationRow {
  return {
    id: "qa-invoice",
    invoice_number: "QA-0001",
    issued_at: "2026-10-20",
    customer_name: "QA",
    status: "sent",
    cfdi_status: "stamped",
    cancellation_status: null,
    cfdi_uuid: "qa-uuid",
    facturapi_invoice_id: "qa-id",
    facturapi_env: "live",
    total: 100,
    moneda: "MXN",
    tipo_cambio: 1,
    ...overrides,
  };
}

function sheet() {
  const result = captured.workbook?.Sheets["Conciliación"];
  if (!result) throw new Error("Expected a reconciliation workbook");
  return result;
}

describe("QR07: reconciliation XLSX explains currency conversion", () => {
  beforeEach(() => { captured.workbook = undefined; });

  it("preserves 100 MXN + 100 USD as original amounts and totals 1,900 MXN", async () => {
    await downloadReconciliationXlsx([
      invoice(),
      invoice({ id: "qa-usd", invoice_number: "QA-0002", moneda: "USD", tipo_cambio: 18 }),
    ]);

    const ws = sheet();
    expect([ws.I1.v, ws.J1.v, ws.K1.v, ws.L1.v, ws.M1.v]).toEqual([
      "Total (moneda original)", "Moneda", "Tipo de cambio", "Total (MXN)", "Inclusión en total timbrado",
    ]);
    expect([ws.I2.v, ws.J2.v, ws.K2.v, ws.L2.v, ws.M2.v]).toEqual([100, "MXN", 1, 100, "Sí"]);
    expect([ws.I3.v, ws.J3.v, ws.K3.v, ws.L3.v, ws.M3.v]).toEqual([100, "USD", 18, 1800, "Sí"]);
    expect([ws.I4.v, ws.K4.v, ws.L4.v]).toEqual(["", "TOTAL TIMBRADO (MXN)", 1900]);
    expect(ws.M4.v).toContain("Sólo timbradas en producción");
    expect(ws["!cols"]).toHaveLength(13);
    expect(ws["!ref"]).toBe("A1:M4");
    expect([ws.I2.t, ws.K3.t, ws.L3.t, ws.L4.t]).toEqual(["n", "n", "n", "n"]);
  });

  it.each([null, "mxn"])("uses the existing MXN default for currency %s without requiring FX", async (moneda) => {
    await downloadReconciliationXlsx([invoice({ moneda, tipo_cambio: null })]);

    const ws = sheet();
    expect([ws.I2.v, ws.J2.v, ws.K2.v, ws.L2.v, ws.M2.v]).toEqual([
      100, moneda == null ? "MXN (por defecto)" : "MXN", "", 100, "Sí",
    ]);
    expect(ws.L3.v).toBe(100);
    expect(ws["!ref"]).toBe("A1:M3");
  });

  it.each([null, 0, 1, -18, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "preserves a foreign original but excludes an invalid FX value %s from MXN",
    async (tipo_cambio) => {
      await downloadReconciliationXlsx([
        invoice(),
        invoice({ moneda: "USD", tipo_cambio }),
      ]);

      const ws = sheet();
      expect([ws.I3.v, ws.J3.v, ws.L3.v, ws.M3.v]).toEqual([
        100, "USD", "", "No: sin tipo de cambio válido",
      ]);
      expect(ws.K3.v).toBe(tipo_cambio == null ? "" : Number.isFinite(tipo_cambio) ? tipo_cambio : "Inválido");
      expect(ws.L4.v).toBe(100);
      expect([ws.K5.v, ws.L5.v, ws.M5.v]).toEqual([
        "SIN TIPO DE CAMBIO", "", "1 factura(s) timbrada(s) en producción excluida(s) del total",
      ]);
    },
  );

  it("keeps document FX precision and rounds only the exported monetary amounts", async () => {
    await downloadReconciliationXlsx([invoice({ total: 123.45, moneda: "usd", tipo_cambio: 18.123456 })]);

    const ws = sheet();
    expect([ws.I2.v, ws.J2.v, ws.K2.v, ws.L2.v, ws.L3.v]).toEqual([
      123.45, "USD", 18.123456, 2237.34, 2237.34,
    ]);
  });

  it("only includes live stamped rows in the footer while retaining other rows' MXN equivalents", async () => {
    await downloadReconciliationXlsx([
      invoice(),
      invoice({ facturapi_env: "test", moneda: "USD", tipo_cambio: 18 }),
      invoice({ facturapi_env: null }),
      invoice({ cfdi_status: "draft", status: "draft" }),
      invoice({ cfdi_status: "cancelled", status: "cancelled" }),
      invoice({ cfdi_status: null }),
    ]);

    const ws = sheet();
    expect(ws.L3.v).toBe(1800);
    for (const row of [3, 4, 5, 7]) {
      expect(ws[`M${row}`].v).toBe("No: no timbrada en producción");
    }
    expect(ws.M6.v).toBe("No: cancelada");
    expect(ws.L8.v).toBe(100);
    expect(ws["!ref"]).toBe("A1:M8");
  });

  it("excludes an internally cancelled stamped row from the footer, not from the detail", async () => {
    await downloadReconciliationXlsx([invoice({ status: "cancelled", moneda: "USD", tipo_cambio: 18 })]);

    expect([sheet().I2.v, sheet().J2.v, sheet().K2.v, sheet().L2.v, sheet().M2.v])
      .toEqual([100, "USD", 18, 1800, "No: cancelada"]);
    expect(sheet().L3.v).toBe(0);
  });

  it("counts only eligible live stamped rows in the missing-FX notice", async () => {
    await downloadReconciliationXlsx([
      invoice({ moneda: "USD", tipo_cambio: null }),
      invoice({ moneda: "USD", tipo_cambio: null, facturapi_env: "test" }),
      invoice({ moneda: "USD", tipo_cambio: null, cfdi_status: "draft" }),
    ]);

    const ws = sheet();
    expect([ws.L2.v, ws.L3.v, ws.L4.v, ws.L5.v]).toEqual(["", "", "", 0]);
    expect(ws.M6.v).toBe("1 factura(s) timbrada(s) en producción excluida(s) del total");
  });

  it("exports an empty reconciliation with a zero MXN footer", async () => {
    await downloadReconciliationXlsx([]);

    expect([sheet().I2.v, sheet().K2.v, sheet().L2.v]).toEqual(["", "TOTAL TIMBRADO (MXN)", 0]);
    expect(sheet()["!ref"]).toBe("A1:M2");
  });
});
