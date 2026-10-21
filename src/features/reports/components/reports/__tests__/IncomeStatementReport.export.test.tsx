import { useLayoutEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementReport } from "@/features/reports/components/reports/IncomeStatementReport";
const state = vi.hoisted(() => ({
  fetching: true,
  identity: "user:org:internal" as string | null,
  success: vi.fn(),
  saveCsv: vi.fn(),
  company: vi.fn(),
  exportPdf: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/reports/hooks/incomeStatement/useMonthlyData", () => ({
  useMonthlyData: () => ({
    data: [],
    rentedWithoutCost: [],
    soldWithoutCost: [],
    fxMissingCount: 0,
    isError: false,
    isFetching: state.fetching,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/reports/components/reports/IncomeStatementToolbar", () => ({
  IncomeStatementToolbar: ({
    onExportPdf,
    onExportCsv,
    exportDisabled,
  }: {
    onExportPdf: () => void;
    onExportCsv: () => void;
    exportDisabled: boolean;
  }) => (
    <>
      <button disabled={exportDisabled} onClick={onExportPdf}>
        PDF
      </button>
      <button disabled={exportDisabled} onClick={onExportCsv}>
        CSV
      </button>
    </>
  ),
}));
vi.mock("@/lib/exportCsv", () => ({ exportToCsv: state.saveCsv }));
vi.mock("@/lib/pdf/shared", () => ({ fetchCompanyDataAndLogo: state.company }));
vi.mock("@/features/reports/components/reports/IncomeStatementTable", () => ({
  IncomeStatementTable: () => null,
}));
vi.mock("@/lib/pdf/incomeStatement", () => ({
  exportIncomeStatementPdf: state.exportPdf,
}));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({
  useVerifiedIdentityScope: () => state.identity,
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: state.success,
  notifyError: vi.fn(),
}));
beforeEach(() => {
  state.identity = "user:org:internal";
  state.exportPdf.mockReset().mockResolvedValue(undefined);
  state.success.mockClear();
  state.saveCsv.mockClear();
  state.company
    .mockReset()
    .mockResolvedValue({
      company: { razon_social: "QA", rfc: "QA" },
      logoBase64: null,
    });
});
afterEach(cleanup);
describe("Loading and PDF audit reproductions", () => {
  it("ER-UX-06: pending data hides zero KPIs and export actions", () => {
    state.fetching = true;
    render(
      <IncomeStatementReport
        startDate={new Date(2026, 9, 1)}
        endDate={new Date(2026, 9, 31)}
      />,
    );
    expect(screen.queryAllByText("$0.00")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CSV" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });
  it("ER-UX-04: cash export preserves the context and has a stale-download guard", async () => {
    state.fetching = false;
    render(
      <IncomeStatementReport
        startDate={new Date(2026, 9, 1)}
        endDate={new Date(2026, 9, 31)}
        accountingBasis="cash"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(state.exportPdf).toHaveBeenCalled());
    expect(state.exportPdf.mock.calls.at(-1)?.[0].exportContext).toMatchObject({
      accountingBasis: "cash",
      fxMissingCount: 0,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    expect(state.exportPdf.mock.calls.at(-1)?.[0].shouldSave()).toBe(true);
  });
});

describe("In-flight PDF snapshot", () => {
  it.each(["company", "basis", "range", "unmount"] as const)(
    "discards download and success after %s changes",
    async (change) => {
      state.fetching = false;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const saved = vi.fn();
      state.exportPdf.mockImplementation(async (params) => {
        await pending;
        if (!params.shouldSave()) throw new Error("stale");
        saved();
      });
      const props = {
        startDate: new Date(2026, 9, 1),
        endDate: new Date(2026, 9, 31),
        accountingBasis: "cash" as const,
      };
      const view = render(<IncomeStatementReport {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "PDF" }));
      await waitFor(() => expect(state.exportPdf).toHaveBeenCalledTimes(1));
      if (change === "unmount") view.unmount();
      else {
        if (change === "company")
          state.identity = "other:organization:internal";
        view.rerender(
          <IncomeStatementReport
            {...props}
            accountingBasis={change === "basis" ? "accrual" : "cash"}
            endDate={
              change === "range" ? new Date(2026, 10, 30) : props.endDate
            }
          />,
        );
      }
      expect(state.exportPdf.mock.calls[0][0].shouldSave()).toBe(false);
      await act(async () => {
        release();
        await pending;
      });
      expect(saved).not.toHaveBeenCalled();
      expect(state.success).not.toHaveBeenCalled();
    },
  );
});
it("does not resurrect an export after context A to B to A", async () => {
  state.fetching = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saved = vi.fn();
  state.exportPdf.mockImplementation(async (params) => {
    await pending;
    if (!params.shouldSave()) throw new Error("stale");
    saved();
  });
  const props = {
    startDate: new Date(2026, 9, 1),
    endDate: new Date(2026, 9, 31),
    accountingBasis: "cash" as const,
  };
  const view = render(<IncomeStatementReport {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  await waitFor(() => expect(state.exportPdf).toHaveBeenCalledTimes(1));
  state.identity = "other:organization:internal";
  view.rerender(<IncomeStatementReport {...props} />);
  expect(state.exportPdf.mock.calls[0][0].shouldSave()).toBe(false);
  state.identity = "user:org:internal";
  view.rerender(<IncomeStatementReport {...props} />);
  await act(async () => {
    release();
    await pending;
  });
  expect(saved).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
});

it("invalidates the export before layout effects observe changed context", async () => {
  state.fetching = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.exportPdf.mockImplementation(async () => {
    await pending;
  });
  const observations: boolean[] = [];
  function Parent({ scope }: { scope: string }) {
    useLayoutEffect(() => {
      const call = state.exportPdf.mock.calls[0]?.[0];
      if (call) observations.push(call.shouldSave());
    }, [scope]);
    return (
      <IncomeStatementReport
        startDate={new Date(2026, 9, 1)}
        endDate={new Date(2026, 9, 31)}
        accountingBasis="cash"
      />
    );
  }
  const view = render(<Parent scope="user:org:internal" />);
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  await waitFor(() => expect(state.exportPdf).toHaveBeenCalledTimes(1));
  state.identity = "other:organization:internal";
  view.rerender(<Parent scope="other:organization:internal" />);
  await act(async () => {
    release();
    await pending;
  });
  expect(observations).toEqual([false]);
});

it.each(["company", "basis", "range", "refetch"] as const)(
  "CSV never revives after %s A to B to A",
  async (change) => {
    state.fetching = false;
    let release!: (value: {
      company: { razon_social: string; rfc: string };
      logoBase64: null;
    }) => void;
    const pending = new Promise<{
      company: { razon_social: string; rfc: string };
      logoBase64: null;
    }>((resolve) => {
      release = resolve;
    });
    state.company.mockReturnValue(pending);
    const props = {
      startDate: new Date(2026, 9, 1),
      endDate: new Date(2026, 9, 31),
      accountingBasis: "cash" as const,
    };
    const view = render(<IncomeStatementReport {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    await waitFor(() => expect(state.company).toHaveBeenCalledTimes(1));
    if (change === "company") state.identity = "other:org:internal";
    if (change === "refetch") state.fetching = true;
    view.rerender(
      <IncomeStatementReport
        {...props}
        accountingBasis={change === "basis" ? "accrual" : "cash"}
        endDate={change === "range" ? new Date(2026, 10, 30) : props.endDate}
      />,
    );
    state.identity = "user:org:internal";
    state.fetching = false;
    view.rerender(<IncomeStatementReport {...props} />);
    await act(async () => {
      release({
        company: { razon_social: "Wrong company B", rfc: "B" },
        logoBase64: null,
      });
      await pending;
    });
    expect(state.saveCsv).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  },
);
