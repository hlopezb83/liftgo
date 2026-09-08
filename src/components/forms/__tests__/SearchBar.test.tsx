import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "../SearchBar";

/**
 * V26-04: el buscador compartido solo tenía placeholder. Con texto escrito el
 * placeholder desaparece y el control se quedaba sin nombre accesible.
 */
describe("SearchBar (V26-04)", () => {
  it("expone nombre accesible contextual aunque haya texto escrito", () => {
    render(<SearchBar value="mont" onChange={vi.fn()} placeholder="Buscar facturas…" />);
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
});
