import { subMonths } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPaymentsXlsx } from "@/features/accounts-payable/lib/buildPaymentsXlsx";
import { downloadReconciliationXlsx } from "@/features/invoices/lib/reconciliationExport";
import { formatDateMty, toYMD } from "@/lib/format/dateFormats";
import { capitalize, formatMtyDate, nowMty } from "@/lib/utils";

const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock("@e965/xlsx", async (importOriginal) => ({
  ...await importOriginal<typeof import("@e965/xlsx")>(),
  writeFile,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// TZ must be set before Node starts. Mutating it inside a worker thread does
// not change Date's timezone and would give false cross-timezone coverage.
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe(`date guardrail migrations preserve civil and wall-clock formatting (${timezone})`, () => {
  it("runs in the requested real local timezone when the matrix is enabled", () => {
    const expectedTimezone = process.env.LIFTGO_EXPECT_LOCAL_TZ;
    if (expectedTimezone) {
      const januaryOffsets: Record<string, number> = { UTC: 0, "America/Los_Angeles": 480, "Asia/Tokyo": -540 };
      expect(timezone).toBe(expectedTimezone);
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(januaryOffsets[expectedTimezone]);
    }
  });

  it("keeps month keys and date-picker days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T05:59:00Z"));
    // nowMty is already a wall-clock Date: project local fields once.
    expect(toYMD(nowMty()).slice(0, 7)).toBe("2025-12");
    expect(toYMD(subMonths(nowMty(), 3)).slice(0, 7)).toBe("2025-09");
    const picked = new Date(2026, 0, 1);
    expect(formatDateMty(toYMD(picked))).toBe("01/01/2026");
    expect(capitalize(formatMtyDate("2026-01-15", "MMM yyyy"))).toBe("Ene 2026");
    expect(formatMtyDate("2026-01-01", "dd/MM")).toBe("01/01");
    expect(formatMtyDate("2026-01-01", "dd/MM/yyyy")).toBe("01/01/2026");
  });

  it("keeps XLSX filenames in Monterrey without applying the offset twice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T05:59:00Z"));
    const payments = await downloadPaymentsXlsx([], "abcdefgh-qa");
    const reconciliation = await downloadReconciliationXlsx([]);
    expect(payments).toBe("pagos-proveedores-31122025-2359-abcdefgh.xlsx");
    expect(reconciliation).toBe("conciliacion-facturas-31122025-2359.xlsx");
    expect(writeFile).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-01-01T06:00:00Z"));
    expect(await downloadPaymentsXlsx([])).toBe("pagos-proveedores-01012026-0000.xlsx");
  });
});
