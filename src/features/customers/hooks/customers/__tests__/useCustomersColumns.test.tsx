import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCustomersColumns } from "../useCustomersColumns";

const customer = { id: "c-1", name: "Grupo Matrimar S.A. de C.V.", rfc: "MAT010203ABC" };

describe("useCustomersColumns Untranslated wrapping", () => {
  it("marks customer name as translate=no", () => {
    const columns = useCustomersColumns();
    const nameCol = columns.find((c) => c.id === "name");
    if (typeof nameCol?.cell !== "function") throw new Error("no cell");
    const { container } = render(<>{nameCol.cell({ row: { original: customer } } as never)}</>);
    const el = container.querySelector('[translate="no"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain("Grupo Matrimar");
  });
});
