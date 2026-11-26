// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTableV2 } from "../DataTableV2";
import { useLiftgoTable } from "../useLiftgoTable";
import type { ColumnDef } from "../types";

interface RowItem {
  id: string;
  postedDate: string;
  amount: number;
  label: string;
}

const columns: ColumnDef<RowItem>[] = [
  {
    accessorKey: "postedDate",
    header: "Fecha",
    meta: { kind: "date" },
  },
  {
    accessorKey: "label",
    header: "Concepto",
  },
  {
    accessorKey: "amount",
    header: "Importe",
    meta: { kind: "money" },
  },
];

function VirtualTableHarness({ activeId }: { activeId?: string }) {
  const data: RowItem[] = Array.from({ length: 120 }, (_, i) => ({
    id: `row-${i}`,
    postedDate: "2026-11-26",
    label: `Concepto ${i}`,
    amount: 1000 + i,
  }));

  const table = useLiftgoTable<RowItem>({
    data,
    columns,
    getRowId: (r) => r.id,
    paginated: false,
  });

  return (
    <DataTableV2
      table={table}
      virtualized
      rowClassName={(item) => (item.id === activeId ? "bg-accent/60" : undefined)}
    />
  );
}

describe("VirtualBody parity with DataTableBodyV2", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      { width: 100, height: 44 },
    ] as unknown as DOMRectList);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TBODY" ? 600 : 44;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TBODY" ? 600 : 44;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("aplica resolveColumnKind y zebra striping estable sin pisar rowClassName", () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <VirtualTableHarness activeId="row-1" />
      </QueryClientProvider>,
    );

    const row0 = container.querySelector('tr[data-index="0"]');
    const row1 = container.querySelector('tr[data-index="1"]');
    const row3 = container.querySelector('tr[data-index="3"]');

    expect(row0).not.toHaveClass("bg-muted/40");
    expect(row3).toHaveClass("bg-muted/40");
    expect(row1).toHaveClass("bg-accent/60");
    expect(row1).not.toHaveClass("bg-muted/40");

    const moneyCell = screen.getByText("1000").closest("td");
    expect(moneyCell).toHaveClass("text-right", "font-mono", "tabular-nums");

    const dateCell = screen.getAllByText("2026-11-26")[0]?.closest("td");
    expect(dateCell).toHaveClass("text-left", "text-muted-foreground", "whitespace-nowrap");
  });
});
