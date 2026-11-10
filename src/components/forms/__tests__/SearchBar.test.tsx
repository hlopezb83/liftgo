import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "../SearchBar";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FormDialog } from "../FormDialog";

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

  it("muestra el botón de limpiar cuando hay texto y lo limpia al hacer clic", () => {
    const onChange = vi.fn();
    render(<SearchBar value="test" onChange={onChange} placeholder="Buscar…" debounceMs={0} />);

    // El botón de limpiar debe existir
    const clearButton = screen.getByRole("button", { name: "Limpiar búsqueda" });
    expect(clearButton).toBeInTheDocument();

    // Hacer clic en limpiar
    fireEvent.click(clearButton);

    // El input debe quedar vacío y enfocado
    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });
});


describe("SearchBar Escape", () => {
  afterEach(() => vi.useRealTimers());

  it("limpia, conserva el foco y no propaga Escape cuando hay texto", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    const { container } = render(
      <>
        <SearchBar value="mont" onChange={onChange} debounceMs={200} />
      </>,
    );
    container.addEventListener("keydown", onKeyDown);
    const input = screen.getByRole("searchbox");
    input.focus();
    const escape = createEvent.keyDown(input, { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("con el campo vacío deja Escape al contenedor sin desenfocar", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    const { container } = render(
      <>
        <SearchBar value="" onChange={onChange} />
      </>,
    );
    container.addEventListener("keydown", onKeyDown);
    const input = screen.getByRole("searchbox");
    input.focus();
    const escape = createEvent.keyDown(input, { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, escape);

    expect(escape.defaultPrevented).toBe(false);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(input).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancela texto pendiente de debounce y no emite una búsqueda obsoleta", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchBar value="mont" onChange={onChange} debounceMs={200} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "montacargas" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.keyDown(input, { key: "Escape" });
    act(() => vi.advanceTimersByTime(500));

    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("no emite al escribir y limpiar antes de publicar la primera búsqueda", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} debounceMs={200} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "mont" } });
    fireEvent.keyDown(input, { key: "Escape" });
    act(() => vi.advanceTimersByTime(500));

    expect(input).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("no intercepta otras teclas ni Escape dirigido a otro control", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <>
        <SearchBar value="mont" onChange={vi.fn()} />
        <input aria-label="Otro campo" />
      </>,
    );
    container.addEventListener("keydown", onKeyDown);
    const input = screen.getByRole("searchbox");
    const enter = createEvent.keyDown(input, { key: "Enter", bubbles: true, cancelable: true });
    fireEvent(input, enter);
    const other = screen.getByRole("textbox");
    other.focus();
    fireEvent.keyDown(other, { key: "Escape" });

    expect(enter.defaultPrevented).toBe(false);
    expect(input).toHaveValue("mont");
    expect(other).toHaveFocus();
    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });

  it("no consume Escape mientras el usuario compone texto", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <>
        <SearchBar value="mont" onChange={vi.fn()} />
      </>,
    );
    container.addEventListener("keydown", onKeyDown);
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(input).toHaveValue("mont");
    expect(input).toHaveFocus();
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("solo limpia el SearchBar que recibe Escape", () => {
    render(<>
      <SearchBar value="mont" onChange={vi.fn()} aria-label="Buscar equipo" />
      <SearchBar value="cliente" onChange={vi.fn()} aria-label="Buscar cliente" />
    </>);
    const equipment = screen.getByRole("searchbox", { name: "Buscar equipo" });
    const customer = screen.getByRole("searchbox", { name: "Buscar cliente" });
    customer.focus();
    fireEvent.keyDown(customer, { key: "Escape" });

    expect(equipment).toHaveValue("mont");
    expect(customer).toHaveValue("");
    expect(customer).toHaveFocus();
  });

  it.each([
    { name: "Dialog", Root: Dialog, Content: DialogContent, Title: DialogTitle, Trigger: DialogTrigger },
    { name: "Sheet", Root: Sheet, Content: SheetContent, Title: SheetTitle, Trigger: SheetTrigger },
  ])("primero limpia y después deja cerrar $name y restaurar el foco", async ({ Root, Content, Title, Trigger }) => {
    const onOpenChange = vi.fn();
    render(
      <Root defaultOpen onOpenChange={onOpenChange}>
        <Trigger>Abrir búsqueda</Trigger>
        <Content aria-describedby={undefined}>
          <Title>Buscar equipo</Title>
          <SearchBar value="mont" onChange={vi.fn()} />
        </Content>
      </Root>,
    );
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir búsqueda" })).toHaveFocus());
  });

  it("respeta la confirmación del formulario después de limpiar", () => {
    const onOpenChange = vi.fn();
    render(
      <FormDialog open isDirty onOpenChange={onOpenChange} title="Editar equipo">
        <SearchBar value="mont" onChange={vi.fn()} />
      </FormDialog>,
    );
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
