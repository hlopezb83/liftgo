import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReconciliationFilterBar } from "../ReconciliationFilterBar";
import type { ReconciliationFilters } from "../../../hooks/reconciliation/useReconciliationData";

function Filters() {
  const [filters, setFilters] = useState<ReconciliationFilters>({
    from: "2026-09-01", to: "2026-09-30", fiscalState: "stamped", env: "test",
  });
  return (
    <>
      <ReconciliationFilterBar filters={filters} invalidRange={filters.from > filters.to} onChange={setFilters} />
      <output aria-label="Rango ISO">{filters.from}..{filters.to}</output>
    </>
  );
}

describe("fechas de conciliación", () => {
  it("presenta DD/MM/AAAA y conserva ISO sin desplazar el día al editar", () => {
    render(<Filters />);
    expect(screen.getByLabelText("Desde")).toHaveValue("01/09/2026");
    expect(screen.getByLabelText("Hasta")).toHaveValue("30/09/2026");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "02/10/2026" } });
    expect(screen.getByLabelText("Rango ISO")).toHaveTextContent("2026-10-02..2026-09-30");
    expect(screen.getByText(/no puede ser posterior/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ambiente PAC" })).toHaveTextContent("Sandbox");
  });

  it("permite limpiar una fecha con el teclado sin conservar el filtro anterior", () => {
    render(<Filters />);
    fireEvent.keyDown(screen.getByLabelText("Desde"), { key: "Escape" });
    expect(screen.getByLabelText("Rango ISO")).toHaveTextContent("..2026-09-30");
  });
});
