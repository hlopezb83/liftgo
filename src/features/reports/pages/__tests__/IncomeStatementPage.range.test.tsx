import { toYMD } from "@/lib/format/dateFormats";
import { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import IncomeStatementPage from "@/features/reports/pages/IncomeStatementPage";
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("@/features/reports/components/reports/IncomeStatementReport", () => ({
  IncomeStatementReport: ({
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }) => (
    <output
      data-testid="period"
      data-start={toYMD(startDate)}
      data-end={toYMD(endDate)}
    />
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("ER-UX-07: UI blocks inverted range before querying and resumes after correction", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  render(<IncomeStatementPage />);
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "2026-10" } });
  fireEvent.change(selects[1], { target: { value: "2026-01" } });
  expect(screen.queryByTestId("period")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Desde no puede ser posterior",
  );
  fireEvent.change(selects[1], { target: { value: "2026-10" } });
  expect(screen.getByTestId("period").dataset.start).toBe("2026-10-01");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
