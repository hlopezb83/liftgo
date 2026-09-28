import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecurringInvoicesResultDialog } from "../RecurringInvoicesResultDialog";

vi.mock("@/lib/router-compat-ui", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#invoice">{children}</a>,
}));

afterEach(cleanup);

it("separa las facturas existentes de las creadas y no ofrece reintentar el grupo obsoleto", () => {
  render(
    <RecurringInvoicesResultDialog
      open
      onOpenChange={() => {}}
      onRetry={() => {}}
      isRetrying={false}
      result={{
        invoicesCreated: 1,
        created: [{ bookingIds: ["a"], invoiceId: "new", invoiceNumber: "FAC-0002" }],
        alreadyExisting: [{ bookingIds: ["b"], invoiceId: "old", invoiceNumber: "FAC-0001" }],
        failed: [{ bookingIds: ["a", "b"], error: "El grupo de reservas cambió: actualiza la vista previa." }],
      }}
    />,
  );

  expect(screen.getByText("Creadas (1)")).toBeInTheDocument();
  expect(screen.getByText("Ya existentes (1)")).toBeInTheDocument();
  expect(screen.getByText("FAC-0001")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
});
