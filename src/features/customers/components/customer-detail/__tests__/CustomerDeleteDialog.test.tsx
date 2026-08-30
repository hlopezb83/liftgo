import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { describeBusinessBlock, resolveBusinessBlock } from "@/lib/rules/businessBlocks";
import { CustomerDeleteDialog } from "../CustomerDeleteDialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  customerName: "Aceros del Norte",
  bookingsCount: 3,
  invoicesCount: 5,
  activeBookingsCount: 0,
  isPending: false,
  onDelete: vi.fn(),
};

describe("mapeo del bloqueo por saldo pendiente", () => {
  it("reconoce el rechazo del backend como customer_outstanding_balance", () => {
    const block = resolveBusinessBlock(
      new Error("No se puede archivar: el cliente tiene saldo pendiente"),
    );
    expect(block?.code).toBe("customer_outstanding_balance");
  });
});

describe("CustomerDeleteDialog", () => {
  it("usa la copia canónica del bloqueo cuando hay saldo pendiente", () => {
    const copy = describeBusinessBlock("customer_outstanding_balance");
    render(<CustomerDeleteDialog {...baseProps} outstanding={1160} />);
    expect(screen.getByText(new RegExp(copy.reason.slice(0, 30), "i"))).toBeInTheDocument();
    expect(screen.getByText(copy.nextStep)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
  });

  it("permite archivar cuando el saldo está en cero y no hay reservas activas", () => {
    render(<CustomerDeleteDialog {...baseProps} outstanding={0} />);
    expect(screen.getByRole("button", { name: "Archivar" })).toBeInTheDocument();
  });

  it("muestra el bloque explicable cuando la BD rechaza por carrera", () => {
    const block = describeBusinessBlock("customer_outstanding_balance");
    render(
      <MemoryRouter>
        <CustomerDeleteDialog {...baseProps} outstanding={0} serverBlock={block} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("blocked-action-notice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
  });
});
