import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TotalsSummary } from "@/components/domain/TotalsSummary";

describe("TotalsSummary — normalización de taxRate (R5)", () => {
  it("muestra IVA (16%) cuando taxRate viene como fracción 0.16", () => {
    render(<TotalsSummary subtotal={100} taxRate={0.16} taxAmount={16} total={116} />);
    expect(screen.getByText("IVA (16%)")).toBeInTheDocument();
  });

  it("muestra IVA (16%) cuando taxRate ya viene como entero 16", () => {
    render(<TotalsSummary subtotal={100} taxRate={16} taxAmount={16} total={116} />);
    expect(screen.getByText("IVA (16%)")).toBeInTheDocument();
  });

  it("muestra IVA (0%) cuando taxRate es 0", () => {
    render(<TotalsSummary subtotal={100} taxRate={0} taxAmount={0} total={100} />);
    expect(screen.getByText("IVA (0%)")).toBeInTheDocument();
  });

  it("muestra IVA (8%) cuando taxRate es fracción 0.08 (frontera IVA)", () => {
    render(<TotalsSummary subtotal={100} taxRate={0.08} taxAmount={8} total={108} />);
    expect(screen.getByText("IVA (8%)")).toBeInTheDocument();
  });
});
