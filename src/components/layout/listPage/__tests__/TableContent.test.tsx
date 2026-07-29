import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TableContent } from "../TableContent";

interface Item {
  id?: string;
  name?: string;
}

const base = {
  isLoading: false,
  isError: false,
  showEmpty: true,
  showMobileCards: false,
  items: [] as Item[],
  emptyMessage: "Sin clientes",
  hasActiveFilters: false,
};

describe("TableContent — estados vacíos", () => {
  it("sin filtros muestra el mensaje y la acción de creación", () => {
    const onEmptyAction = vi.fn();
    render(
      <TableContent<Item>
        {...base}
        emptyActionLabel="Nuevo cliente"
        onEmptyAction={onEmptyAction}
      />,
    );
    expect(screen.getByText("Sin clientes")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay registros aquí.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });

  it("con filtros activos ofrece limpiar filtros", () => {
    const onClearFilters = vi.fn();
    render(
      <TableContent<Item>
        {...base}
        hasActiveFilters
        emptyActionLabel="Nuevo cliente"
        onClearFilters={onClearFilters}
      />,
    );
    expect(
      screen.getByText("No hay resultados con los filtros actuales"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("con filtros activos y sin handler no muestra botón", () => {
    render(<TableContent<Item> {...base} hasActiveFilters />);
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });

  it("prioriza el estado de error sobre el vacío", () => {
    const onRetry = vi.fn();
    render(<TableContent<Item> {...base} isError onRetry={onRetry} />);
    expect(screen.queryByText("Sin clientes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("muestra el esqueleto mientras carga", () => {
    const { container } = render(
      <TableContent<Item> {...base} isLoading skeletonColumns={4} />,
    );
    expect(screen.queryByText("Sin clientes")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renderiza tarjetas móviles cuando corresponde", () => {
    render(
      <TableContent<Item>
        {...base}
        showEmpty={false}
        showMobileCards
        items={[{ id: "1", name: "Acme" }]}
        mobileCardRender={(item) => <span>{item.name}</span>}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
