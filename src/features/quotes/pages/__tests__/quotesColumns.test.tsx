import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { buildQuotesColumns } from "../quotesColumns";

const quote = {
  id: "q-1",
  quote_number: "COT-0001",
  quote_type: "rental",
  customer_name: "Industrias del Valle",
  start_date: "2026-01-01",
  end_date: "2026-01-10",
  total: 5000,
  status: "sent",
  valid_until: "2026-02-01",
};

describe("buildQuotesColumns Untranslated wrapping", () => {
  it("marks quote_number and customer_name as translate=no", () => {
    const columns = buildQuotesColumns<typeof quote>();
    const numCol = columns.find((c) => c.id === "quote_number");
    const custCol = columns.find((c) => c.id === "customer_name");
    if (typeof numCol?.cell !== "function" || typeof custCol?.cell !== "function") {
      throw new Error("missing cells");
    }
    const { container: c1 } = render(<>{numCol.cell({ row: { original: quote } } as never)}</>);
    const { container: c2 } = render(<>{custCol.cell({ row: { original: quote } } as never)}</>);
    expect(c1.querySelector('[translate="no"]')?.textContent).toContain("COT-0001");
    expect(c2.querySelector('[translate="no"]')?.textContent).toContain("Industrias del Valle");
  });
});
