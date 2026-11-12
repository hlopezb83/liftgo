import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { zeroSummary } from "../../lib/__tests__/accountsPayable.fixture";
import { AccountsPayableKpiCards } from "../AccountsPayableKpiCards";

describe("accounts payable KPI availability", () => {
  it("distinguishes unavailable values from confirmed zero amounts and counts", () => {
    const { rerender } = render(<AccountsPayableKpiCards kpis={undefined} />);
    expect(screen.getAllByText("—")).toHaveLength(6);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByTitle("$0.00")).not.toBeInTheDocument();
    rerender(<AccountsPayableKpiCards kpis={zeroSummary().kpis} />);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getAllByTitle("$0.00")).toHaveLength(5);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
