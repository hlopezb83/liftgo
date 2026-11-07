import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "../SearchBar";

/**
 * V26-04: el buscador compartido solo tenía placeholder. Con texto escrito el
 * placeholder desaparece y el control se quedaba sin nombre accesible.
 */
describe("SearchBar (V26-04)", () => {
  it("expone nombre accesible contextual aunque haya texto escrito", () => {
    render(
      <SearchBar
        value="mont"
        onChange={vi.fn()}
        placeholder="Buscar facturas…"
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Buscar facturas…" });
    expect(input).toHaveValue("mont");
  });

  it("permite sobreescribir el nombre accesible y conserva el placeholder", () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        value=""
        onChange={onChange}
        placeholder="Buscar…"
        aria-label="Buscar reservas"
        debounceMs={0}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Buscar reservas" });
    expect(input).toHaveAttribute("placeholder", "Buscar…");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input).toHaveValue("abc");
  });

  it("muestra el botón de limpiar cuando hay texto y lo limpia al hacer clic", () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        value="test"
        onChange={onChange}
        placeholder="Buscar…"
        debounceMs={0}
      />,
    );

    // El botón de limpiar debe existir
    const clearButton = screen.getByRole("button", {
      name: "Limpiar búsqueda",
    });
    expect(clearButton).toBeInTheDocument();

    // Hacer clic en limpiar
    fireEvent.click(clearButton);

    // El input debe quedar vacío y enfocado
    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("limpia el texto al presionar Escape cuando hay texto ingresado", () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        value="consulta inicial"
        onChange={onChange}
        placeholder="Buscar…"
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("consulta inicial");

    // Presionar Escape con texto presente
    fireEvent.keyDown(input, { key: "Escape" });

    // El input debe vaciarse
    expect(input).toHaveValue("");
  });

  it("desenfoca el input al presionar Escape si ya está vacío", () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        value=""
        onChange={onChange}
        placeholder="Buscar…"
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("searchbox");
    input.focus();
    expect(input).toHaveFocus();

    // Presionar Escape cuando ya está vacío
    fireEvent.keyDown(input, { key: "Escape" });

    // El input debe perder el foco
    expect(input).not.toHaveFocus();
  });
});
