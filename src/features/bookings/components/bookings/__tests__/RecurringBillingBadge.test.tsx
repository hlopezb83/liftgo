import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RecurringBillingBadge } from "../RecurringBillingBadge";

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
});
