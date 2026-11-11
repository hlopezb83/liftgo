import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import { DataTableV2 } from "../DataTableV2";
import { useLiftgoTable } from "../useLiftgoTable";

const data = [{ id: "inv-1", folio: "FAC-001", customer: "Cliente prueba" }];

function Harness({ onOpen, onMenu, navigation = false }: {
  onOpen: () => void; onMenu: () => void; navigation?: boolean;
}) {
  const location = useLocation();
  const table = useLiftgoTable({ data, getRowId: (item) => item.id, enableRowSelection: true,
    columns: [
      { id: "folio", accessorKey: "folio", header: "Folio" },
      { id: "customer", accessorKey: "customer", header: "Cliente" },
      { id: "actions", header: "Acciones", cell: () => <>
        <button type="button" onClick={onMenu}>Otras acciones</button>
        <input aria-label="Nota de fila" />
        <a href="#ayuda">Ayuda</a>
      </> },
    ],
  });
  return <>
    <DataTableV2 table={table} enableRowSelection onRowClick={onOpen}
      rowAction={{ columnId: "folio", label: (item) => `Ver factura ${item.folio}`,
        ...(navigation ? { to: (item: typeof data[number]) => `/invoices/${item.id}`,
          state: () => ({ invoiceListBackTo: "/invoices?status=partial" }) } : {}),
      }} />
    <output data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>
  </>;
}

async function mount(navigation = false) {
  const onOpen = vi.fn(); const onMenu = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><TestRouter>
    <Harness onOpen={onOpen} onMenu={onMenu} navigation={navigation} />
  </TestRouter></QueryClientProvider>);
  const table = await screen.findByRole("table");
  const row = within(table).getAllByRole("row")[1];
  return { table, row, onOpen, onMenu };
}

describe("DataTableV2: filas nativas y acciones independientes", () => {
  it("conserva tabla, encabezados, filas y celdas; el inspector tiene botón propio", async () => {
    const { table, row, onOpen } = await mount();
    expect(within(table).getByRole("columnheader", { name: /Folio/ })).toBeInTheDocument();
    expect(within(row).getAllByRole("cell")).toHaveLength(4);
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");
    const action = within(row).getByRole("button", { name: "Ver factura FAC-001" });
    action.focus(); expect(action).toHaveFocus();
    fireEvent.click(action);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("no activa la fila desde un checkbox, menú, enlace ni campo de captura", async () => {
    const { row, onOpen, onMenu } = await mount();
    const checkbox = within(row).getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(within(row).getByRole("button", { name: "Otras acciones" }));
    fireEvent.keyDown(within(row).getByRole("button", { name: "Otras acciones" }), { key: "Enter" });
    fireEvent.click(within(row).getByRole("textbox", { name: "Nota de fila" }));
    fireEvent.keyDown(within(row).getByRole("textbox", { name: "Nota de fila" }), { key: " " });
    fireEvent.click(within(row).getByRole("link", { name: "Ayuda" }));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByText("Cliente prueba"), { ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByText("Cliente prueba"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("el folio es un enlace real y conserva el regreso a la lista sin doble activación", async () => {
    const { row, onOpen } = await mount(true);
    const link = within(row).getByRole("link", { name: "Ver factura FAC-001" });
    expect(link).toHaveAttribute("href", "/invoices/inv-1");
    fireEvent.click(link);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}")).toMatchObject({
      pathname: "/invoices/inv-1", state: { invoiceListBackTo: "/invoices?status=partial" },
    }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
