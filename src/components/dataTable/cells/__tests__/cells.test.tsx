import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CurrencyCell, StatusCell } from "../index";

describe("dataTable/cells", () => {
  it("CurrencyCell renderiza MXN por default", () => {
    render(<CurrencyCell value={1234.5} />);
    expect(screen.getByText(/1,234\.50/)).toBeInTheDocument();
  });

  it("CurrencyCell respeta currency override", () => {
    render(<CurrencyCell value={1000} currency="USD" />);
    expect(screen.getByText(/1,000\.00/)).toBeInTheDocument();
  });

  it("CurrencyCell aplica clase destructive cuando es negativo y highlightNegative", () => {
    const { container } = render(<CurrencyCell value={-50} highlightNegative />);
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });

  it("StatusCell muestra guion cuando status es nulo", () => {
    render(<StatusCell status={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("StatusCell respeta label override", () => {
    render(<StatusCell status="paid" label="Cobrado" />);
    expect(screen.getByText("Cobrado")).toBeInTheDocument();
  });
});
