import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { InvoiceFiscalDataCard } from "../InvoiceFiscalDataCard";

function invoice(overrides: Partial<Tables<"invoices">> = {}) {
  return { serie: "F", folio: 25, forma_pago: "03", metodo_pago: "PPD", uso_cfdi: "G03", moneda: "USD", ...overrides } as Tables<"invoices">;
}

afterEach(cleanup);

describe("InvoiceFiscalDataCard labels", () => {
  it("muestra código y nombre fiscal sin cambiar moneda, serie ni folio", () => {
    render(<InvoiceFiscalDataCard invoice={invoice()} />);
    expect(screen.getByText("03 - Transferencia electrónica de fondos")).toBeInTheDocument();
    expect(screen.getByText("PPD - Pago en parcialidades o diferido")).toBeInTheDocument();
    expect(screen.getByText("G03 - Gastos en general")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("conserva códigos históricos desconocidos en vez de asignarles otra etiqueta", () => {
    render(<InvoiceFiscalDataCard invoice={invoice({ forma_pago: "legacy-form", metodo_pago: "legacy-method", uso_cfdi: "legacy-usage" })} />);
    expect(screen.getByText("legacy-form")).toBeInTheDocument();
    expect(screen.getByText("legacy-method")).toBeInTheDocument();
    expect(screen.getByText("legacy-usage")).toBeInTheDocument();
    expect(screen.queryByText("03 - Transferencia electrónica de fondos")).not.toBeInTheDocument();
  });

  it("no inventa valores para campos fiscales vacíos", () => {
    render(<InvoiceFiscalDataCard invoice={invoice({ forma_pago: null, metodo_pago: null, uso_cfdi: null })} />);
    expect(screen.queryByText("Forma de Pago")).not.toBeInTheDocument();
    expect(screen.queryByText("Método de Pago")).not.toBeInTheDocument();
    expect(screen.queryByText("Uso CFDI")).not.toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
  });
});
