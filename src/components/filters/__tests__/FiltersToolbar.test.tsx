import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FiltersToolbar } from "../FiltersToolbar";

describe("FiltersToolbar", () => {
  it("renders Search and propagates changes", () => {
    const onChange = vi.fn();
    render(
      <FiltersToolbar>
        <FiltersToolbar.Search value="" onChange={onChange} placeholder="Buscar…" />
      </FiltersToolbar>,
    );
    const input = screen.getByPlaceholderText("Buscar…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hola" } });
    expect(onChange).toHaveBeenCalledWith("hola");
  });

  it("renders StatusTabs options and fires onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    render(
      <FiltersToolbar>
        <FiltersToolbar.StatusTabs
          value="all"
          onChange={onChange}
          options={[
            { value: "all", label: "Todos" },
            { value: "paid", label: "Pagadas" },
          ]}
        />
      </FiltersToolbar>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Pagadas" }));
    expect(onChange).toHaveBeenCalledWith("paid");
  });

  it("only renders ClearAll when visible=true and fires onClick", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <FiltersToolbar>
        <FiltersToolbar.ClearAll visible={false} onClick={onClick} />
      </FiltersToolbar>,
    );
    expect(screen.queryByRole("button", { name: /limpiar/i })).toBeNull();

    rerender(
      <FiltersToolbar>
        <FiltersToolbar.ClearAll visible onClick={onClick} />
      </FiltersToolbar>,
    );
    fireEvent.click(screen.getByRole("button", { name: /limpiar/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
