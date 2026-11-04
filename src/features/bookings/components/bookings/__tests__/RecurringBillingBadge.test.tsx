import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RecurringBillingBadge } from "../RecurringBillingBadge";

vi.mock("@/components/ui/tooltip", () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Tooltip: Container, TooltipProvider: Container, TooltipTrigger: Container, TooltipContent: Container };
});

const base = {
  recurring_billing: true,
  last_billed_date: null,
  start_date: "2026-01-01",
} as never;

describe("Bloque 3B · badge de recurrencia", () => {
  it("se muestra en reservas activas", () => {
    render(
      <TooltipProvider>
        <RecurringBillingBadge booking={{ ...(base as object), status: "confirmed" } as never} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Recurrente")).toBeInTheDocument();
  });

  it.each(["completed", "cancelled"])("no se muestra en reservas %s", (status) => {
    render(
      <TooltipProvider>
        <RecurringBillingBadge booking={{ ...(base as object), status } as never} />
      </TooltipProvider>,
    );
    expect(screen.queryByText("Recurrente")).toBeNull();
  });

  it("no infiere el próximo mes pendiente desde una factura adelantada", () => {
    render(<RecurringBillingBadge booking={{
      recurring_billing: true, start_date: "2026-01-01", last_billed_date: "2026-12-31", status: "confirmed",
    } as never} />);
    expect(screen.queryByText("Próx. factura:")).toBeNull();
    expect(screen.getByText("Últ. período facturado:")).toBeInTheDocument();
    expect(screen.getByText(/Puede haber meses anteriores sin facturar/)).toBeInTheDocument();
  });
});
