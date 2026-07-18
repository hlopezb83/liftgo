import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FiltersToolbar } from "../FiltersToolbar";

describe("FiltersToolbar", () => {
  it("renders Search and propagates (debounced) changes", async () => {
    const onChange = vi.fn();
    render(
      <FiltersToolbar>
        <FiltersToolbar.Search value="" onChange={onChange} placeholder="Buscar…" />
      </FiltersToolbar>,
    );
    const input = screen.getByPlaceholderText("Buscar…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hola" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("hola"), { timeout: 1000 });
  });

  it("renders every StatusTabs option label", () => {
    const onChange = vi.fn();
    render(
      <FiltersToolbar>
        <FiltersToolbar.StatusTabs
          value="all"
          onChange={onChange}
          options={[
            { value: "all", label: "Todos" },
            { value: "paid", label: "Pagadas" },
            { value: "overdue", label: "Vencidas" },
          ]}
        />
      </FiltersToolbar>,
    );
    expect(screen.getByRole("tab", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pagadas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Vencidas" })).toBeInTheDocument();
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

  describe("StatusSelect", () => {
    const options = [
      { value: "all", label: "Todos" },
      { value: "draft", label: "Borrador" },
      { value: "sent", label: "Enviada" },
      { value: "paid", label: "Pagada" },
      { value: "overdue", label: "Vencida" },
      { value: "cancelled", label: "Cancelada" },
    ] as const;

    it("renders the label of the current value on the trigger", () => {
      const onChange = vi.fn();
      render(
        <FiltersToolbar>
          <FiltersToolbar.StatusSelect value="paid" onChange={onChange} options={options} />
        </FiltersToolbar>,
      );
      expect(screen.getByRole("combobox")).toHaveTextContent("Pagada");
    });

    it("shows the placeholder when value has no matching option label rendered", () => {
      const onChange = vi.fn();
      render(
        <FiltersToolbar>
          <FiltersToolbar.StatusSelect
            value="all"
            onChange={onChange}
            options={options}
            placeholder="Todos los estados"
          />
        </FiltersToolbar>,
      );
      // Cuando value="all" y su label es "Todos", ese texto se muestra en el trigger.
      expect(screen.getByRole("combobox")).toHaveTextContent("Todos");
    });
  });

  describe("DateRange", () => {
    it("renders placeholder when value is empty", () => {
      const onChange = vi.fn();
      render(
        <FiltersToolbar>
          <FiltersToolbar.DateRange value="" onChange={onChange} placeholder="Filtrar por fecha" />
        </FiltersToolbar>,
      );
      expect(screen.getByRole("button", { name: /filtrar por fecha/i })).toBeInTheDocument();
    });

    it("deserializes 'YYYY-MM-DD..YYYY-MM-DD' and shows the formatted range", () => {
      const onChange = vi.fn();
      render(
        <FiltersToolbar>
          <FiltersToolbar.DateRange value="2026-06-01..2026-06-30" onChange={onChange} />
        </FiltersToolbar>,
      );
      // El formato del trigger es "01/06/2026 — 30/06/2026" (formatRangeLabel).
      const trigger = screen.getByRole("button");
      expect(trigger.textContent).toMatch(/01\/06\/2026/);
      expect(trigger.textContent).toMatch(/30\/06\/2026/);
    });

    it("handles only-from range (open interval) without throwing", () => {
      const onChange = vi.fn();
      render(
        <FiltersToolbar>
          <FiltersToolbar.DateRange value="2026-06-01.." onChange={onChange} />
        </FiltersToolbar>,
      );
      const trigger = screen.getByRole("button");
      expect(trigger.textContent).toMatch(/01\/06\/2026/);
    });

    it("does not throw for invalid serialized values", () => {
      const onChange = vi.fn();
      expect(() =>
        render(
          <FiltersToolbar>
            <FiltersToolbar.DateRange value="foo..bar" onChange={onChange} />
          </FiltersToolbar>,
        ),
      ).not.toThrow();
      // Con ambas fechas inválidas, dateRange resulta undefined y se muestra el placeholder default.
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("does not throw for malformed value without '..' separator", () => {
      const onChange = vi.fn();
      expect(() =>
        render(
          <FiltersToolbar>
            <FiltersToolbar.DateRange value="2026-06-01" onChange={onChange} />
          </FiltersToolbar>,
        ),
      ).not.toThrow();
    });
  });
});
