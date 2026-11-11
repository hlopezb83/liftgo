import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DataTableV2 } from "../DataTableV2";
import { useLiftgoTable } from "../useLiftgoTable";

vi.mock("@/hooks/use-mobile", () => ({ useIsTabletOrBelow: () => true }));

it("usa el ID de cada fila aunque dos filas compartan su objeto original", () => {
  const original = { name: "Equipo" };
  const data = [original, original];

  function MobileTable() {
    const table = useLiftgoTable({ data, columns: [], getRowId: (_row, index) => `row-${index}` });
    return <DataTableV2 table={table} mobileCardRender={(row) => <p>{row.name}</p>} />;
  }

  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    render(<MobileTable />);
    expect(screen.getAllByText("Equipo")).toHaveLength(2);
    expect(error.mock.calls.some(([message]) => String(message).includes("same key"))).toBe(false);
  } finally {
    error.mockRestore();
  }
});
