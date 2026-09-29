import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import type { InvoiceVisibility } from "../../../lib/invoiceVisibility";
import { InvoiceDetailActions } from "../InvoiceDetailActions";

const mocks = vi.hoisted(() => ({ role: "admin", accessLevel: "full" }));

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: mocks.role, isLoading: false, isError: false }),
  useRolePermissions: () => ({
    data: { [mocks.role]: { Facturas: mocks.accessLevel } },
    isLoading: false,
    isError: false,
  }),
  getAccessLevel: (permissions: Record<string, Record<string, string>>, role: string, module: string) =>
    permissions?.[role]?.[module] ?? "none",
}));

vi.mock("@/features/invoices/hooks/invoices/cfdi/useRefreshCancellationStatus", () => ({
  useRefreshCancellationStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/invoices/components/invoices/InvoicePDFButton", () => ({
  InvoicePDFButton: () => null,
}));

const invoice = {
  id: "invoice-1",
  status: "draft",
  cfdi_status: "pending",
  metodo_pago: "PUE",
  cfdi_uuid: null,
  cancellation_status: null,
} as unknown as Tables<"invoices">;

const visibility: InvoiceVisibility = {
  showDraftPdf: false,
  showCfdiPdf: false,
  showCfdiXml: false,
  showAcuseButtons: false,
  showAcuseSyncHint: false,
  showRepColumn: false,
  allowRepMutations: false,
  showSandboxChip: false,
};

function renderActions(role: string) {
  mocks.role = role;
  mocks.accessLevel = "full";
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDetailActions
        invoice={invoice}
        cfdiStatus="pending"
        userRole={role}
        visibility={visibility}
        isStamping={false}
        onOpenPayment={vi.fn()}
        onEdit={vi.fn()}
        onStamp={vi.fn()}
        onDownloadXml={vi.fn()}
        onCancelCfdi={vi.fn()}
        onDelete={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.role = "admin";
  mocks.accessLevel = "full";
});

afterEach(cleanup);

describe("Permisos de timbrado de facturas", () => {
  it.each(["admin", "administrativo"])("%s conserva el botón de timbrado", (role) => {
    renderActions(role);
    expect(screen.getByRole("button", { name: /timbrar CFDI/i })).toBeInTheDocument();
  });

  it("oculta timbrado a otros roles aunque Facturas se configure con acceso completo", () => {
    renderActions("dispatcher");
    expect(screen.queryByRole("button", { name: /timbrar CFDI/i })).not.toBeInTheDocument();
  });
});
