import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TotalsBreakdown } from "../TotalsBreakdown";

describe("TotalsBreakdown — normalización de tax_rate (Bloque 3.1 R4)", () => {
  it("trata tax_rate como fracción cuando ≤ 1 (facturas: 0.16 → 16%)", () => {
    render(<TotalsBreakdown subtotal={1000} taxRate={0.16} taxAmount={160} total={1160} />);
    expect(screen.getByText(/IVA \(16%\)/)).toBeInTheDocument();
  });

  it("trata tax_rate como porcentaje cuando > 1 (cotizaciones: 16 → 16%)", () => {
    render(<TotalsBreakdown subtotal={1000} taxRate={16} taxAmount={160} total={1160} />);
    expect(screen.getByText(/IVA \(16%\)/)).toBeInTheDocument();
  });

  it("maneja 0% sin dividir por cero ni mostrar decimales", () => {
    render(<TotalsBreakdown subtotal={1000} taxRate={0} taxAmount={0} total={1000} />);
    expect(screen.getByText(/IVA \(0%\)/)).toBeInTheDocument();
  });

  it("preserva decimales para tasas fronterizas (0.08 → 8%)", () => {
    render(<TotalsBreakdown subtotal={1000} taxRate={0.08} taxAmount={80} total={1080} />);
    expect(screen.getByText(/IVA \(8%\)/)).toBeInTheDocument();
  });

  it("null/undefined tax_rate → 0%", () => {
    render(<TotalsBreakdown subtotal={1000} taxRate={null} taxAmount={0} total={1000} />);
    expect(screen.getByText(/IVA \(0%\)/)).toBeInTheDocument();
  });
});
