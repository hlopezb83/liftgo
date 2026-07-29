import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFleetColumns } from "../useFleetColumns";
import type { Forklift } from "../../forklifts/useForklifts";

const forklift = {
  id: "f-1",
  name: "MC-001",
  model: "Toyota 8FGU25",
  serial_number: "SN-12345",
  fuel_type: "gas",
  status: "available",
} as unknown as Forklift;

function renderCell(columnId: string) {
  const columns = useFleetColumns(new Set(), new Map());
  const col = columns.find((c) => c.id === columnId);
  if (typeof col?.cell !== "function") throw new Error("column not found");
  return render(<>{col.cell({ row: { original: forklift } } as never)}</>);
}

describe("useFleetColumns Untranslated wrapping", () => {
  it("marks equipment name as translate=no", () => {
    const { container } = renderCell("name");
    const el = container.querySelector('[translate="no"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain("MC-001");
  });

  it("marks serial number as translate=no", () => {
    const { container } = renderCell("serial_number");
    const el = container.querySelector('[translate="no"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain("SN-12345");
  });
});
