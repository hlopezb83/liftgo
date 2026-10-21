import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccessLevel,
  MODULES,
  type PermissionsMap,
} from "@/features/users/hooks/useRolePermissions";
import { IncomeStatementDocuments } from "../IncomeStatementDocuments";
import { IncomeStatementTable } from "../../IncomeStatementTable";
import {
  documentKind,
  documentTotalMatches,
  canOpenStatementDocuments,
  type StatementDocumentPage,
} from "../../../../hooks/incomeStatement/documentDrilldown";

const state = vi.hoisted(() => ({
  financial: true,
  denied: "",
  organizationId: "tenant-a",
  page: 0,
  query: {
    data: undefined as StatementDocumentPage | undefined,
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  calls: vi.fn(),
}));
// Current modules only: an absent module must fail closed, not default to true.
const permissions: PermissionsMap = {
  auditor: Object.fromEntries(MODULES.map((module) => [module, "read"])),
};
vi.mock("@/features/users", () => ({
  useHasFinancialAccess: () => state.financial,
  useHasModuleAccess: (module: string) =>
    getAccessLevel(permissions, "auditor", module) !== "none" &&
    state.denied !== module,
}));
vi.mock("@/contexts/OrganizationContext", () => ({
  useVerifiedOrganizationId: () => state.organizationId,
}));
vi.mock(
  "../../../../hooks/incomeStatement/useIncomeStatementDocuments",
  () => ({
    STATEMENT_DOCUMENT_PAGE_SIZE: 25,
    useIncomeStatementDocuments: (
      scope: unknown,
      selection: unknown,
      page: number,
    ) => {
      state.page = page;
      state.calls(scope, selection, page);
      return state.query;
    },
  }),
);
vi.mock("@/features/accounts-payable", () => ({
  EXPENSE_CATEGORY_LABELS: { renta: "Renta" },
  SupplierBillDetailSheet: () => <div>Ficha de proveedor</div>,
}));
const scope = {
  startDate: "2026-09-01",
  endDate: "2026-10-31",
  accountingBasis: "cash" as const,
};
const selection = {
  kind: "other_services",
  label: "Cliente QA",
  title: "Cliente QA",
  expectedTotal: 1000,
  months: ["2026-10"],
};
function renderDocuments() {
  return render(
    <IncomeStatementDocuments scope={scope} selection={selection} onClose={vi.fn()} />,
  );
}
function page(): StatementDocumentPage {
  return {
    items: [
      {
        row_key: "payment:invoice:payment",
        source_type: "payment",
        document_id: "invoice",
        payment_id: "payment",
        invoice_id: "invoice",
        folio: "FAC-01",
        document_date: "2026-09-15",
        event_date: "2026-10-04",
        month_key: "2026-10",
        currency: "USD",
        amount: 500,
        label: "Cliente QA",
        coverage_start: null,
        coverage_end: null,
      },
    ],
    total_count: 26,
    total_amount: 1000,
    rounding_adjustment: 0,
    limit: 25,
    offset: 0,
    basis: "cash",
    currency: "MXN",
  };
}
const tableProps = {
  documentScope: scope,
  documentsEnabled: true,
  isComparison: false,
  filteredData: [
    { month: "Sep", monthKey: "2026-09" },
    { month: "Oct", monthKey: "2026-10" },
  ],
  yearTotals: [],
  comparisonRows: [],
  statementRows: [
    {
      label: "  Otros Ingresos por Servicios",
      values: [500, 1000],
      total: 1500,
    },
  ],
  depreciationBreakdownRows: [],
  cogsBreakdownRows: [],
  rentalBookedBreakdownRows: [],
  rentalUnbookedBreakdownRows: [],
  salesBreakdownRows: [],
  otherServicesBreakdownRows: [
    { label: "      Cliente QA", values: [500, 1000], total: 1500 },
  ],
  damageRecoveryBreakdownRows: [],
  creditNotesBreakdownRows: [],
  expenseDetailBreakdownByCategory: {},
};
beforeEach(() => {
  state.query = {
    data: page(),
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  state.financial = true;
  state.denied = "";
  state.organizationId = "tenant-a";
  state.calls.mockClear();
});

describe("MEJ-001 source documents", () => {
  it("shows document currency, attribution in MXN and cash event distinct from issuance", () => {
    renderDocuments();
    expect(
      screen.getByText("Total conciliado: $1,000.00 MXN (26 movimientos)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Documento: 2026-09-15")).toBeInTheDocument();
    expect(screen.getByText("Evento: 2026-10-04")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("$500.00 MXN")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir FAC-01 en otra pestaña" }),
    ).toHaveAttribute("href", "/invoices/invoice");
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  });
  it("paginates without altering dates, basis or selected customer and never labels page sum as total", () => {
    renderDocuments();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(state.calls).toHaveBeenLastCalledWith(scope, selection, 1);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(state.page).toBe(0);
  });
  it("does not flash cached rows on page loading; handles error with retry without claiming zero", () => {
    state.query.isFetching = true;
    const view = renderDocuments();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(screen.queryByText("FAC-01")).not.toBeInTheDocument();
    state.query.isFetching = false;
    state.query.isError = true;
    view.rerender(
      <IncomeStatementDocuments
        scope={scope}
        selection={selection}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Total conciliado/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(state.query.refetch).toHaveBeenCalledOnce();
  });
  it("flags a changed total and explains exact cent reconciliation", () => {
    state.query.data!.total_amount = 999.99;
    state.query.data!.rounding_adjustment = 0.01;
    renderDocuments();
    expect(screen.getByRole("alert")).toHaveTextContent("no coincide");
    expect(screen.getByText(/Ajuste de redondeo/)).toHaveTextContent(
      "$0.01 MXN",
    );
    expect(documentTotalMatches(1000, 999.99)).toBe(false);
    expect(documentTotalMatches(-2.025, -2.03)).toBe(true);
  });
  it("opens a selected customer/month and closing preserves the expanded row", async () => {
    render(<IncomeStatementTable {...tableProps} />);
    fireEvent.click(screen.getByText("Otros Ingresos por Servicios"));
    const opener = screen.getByRole("button", {
      name: "Ver documentos de Cliente QA, columna 2",
    });
    opener.focus();
    fireEvent.click(opener);
    expect(state.calls).toHaveBeenLastCalledWith(
      scope,
      expect.objectContaining({
        label: "Cliente QA",
        months: ["2026-10"],
        expectedTotal: 1000,
      }),
      0,
    );
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByText("Documentos de origen")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(
      screen.getByRole("button", {
        name: "Ver documentos de Cliente QA, columna 2",
      }),
    ).toBeInTheDocument();
  });
  it("opens cash documents with invoice read permission and no obsolete Pagos module", () => {
    expect(MODULES).not.toContain("Pagos");
    expect(permissions.auditor).not.toHaveProperty("Pagos");
    expect(getAccessLevel(permissions, "auditor", "Facturas")).toBe("read");
    render(<IncomeStatementTable {...tableProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver documentos de Otros Ingresos por Servicios, total",
      }),
    );
    expect(screen.getByText("Documentos de origen")).toBeInTheDocument();
    expect(state.calls).toHaveBeenLastCalledWith(
      scope,
      expect.objectContaining({ kind: "other_services" }),
      0,
    );
  });
  it.each(["Facturas", "Reportes"])(
    "does not mount or fetch documents without %s",
    (module) => {
      state.denied = module;
      render(<IncomeStatementTable {...tableProps} />);
      expect(
        screen.queryByRole("button", { name: /Ver documentos/ }),
      ).not.toBeInTheDocument();
      expect(state.calls).not.toHaveBeenCalled();
    },
  );
  it("revokes an open sheet on role or organization change", () => {
    const view = render(<IncomeStatementTable {...tableProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver documentos de Otros Ingresos por Servicios, total",
      }),
    );
    expect(screen.getByText("Documentos de origen")).toBeInTheDocument();
    state.financial = false;
    view.rerender(<IncomeStatementTable {...tableProps} />);
    expect(screen.queryByText("Documentos de origen")).not.toBeInTheDocument();
    state.financial = true;
    state.organizationId = "tenant-b";
    view.rerender(<IncomeStatementTable {...tableProps} />);
    expect(screen.queryByText("Documentos de origen")).not.toBeInTheDocument();
  });
  it("supports only source-backed categories, not computed subtotals, and requires both expense sources", () => {
    expect(documentKind("dep")).toBeNull();
    expect(documentKind("cogs")).toBeNull();
    expect(documentKind("exp:renta")).toBe("exp:renta");
    const permissions = {
      financial: true,
      reports: true,
      invoices: true,
      supplierBills: true,
      expenses: false,
    };
    expect(canOpenStatementDocuments("exp:renta", permissions)).toBe(false);
    expect(
      canOpenStatementDocuments("other_services", {
        ...permissions,
        financial: false,
      }),
    ).toBe(false);
  });
});
