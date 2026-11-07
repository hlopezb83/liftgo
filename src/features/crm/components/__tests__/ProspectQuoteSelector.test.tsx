import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectQuoteSelector } from "../prospect-form/ProspectQuoteSelector";

afterEach(cleanup);

describe("ProspectQuoteSelector — moneda", () => {
  it("identifica USD en la cotización seleccionada sin cambiar el importe original", () => {
    const quote = { id: "q-1", quote_number: "COT-0009", customer_name: "Logística Álamo", total: 1160, status: "sent", currency: "USD" };
    render(<ProspectQuoteSelector quoteId={quote.id} onChange={vi.fn()} matchingQuotes={[quote]} selectedQuote={quote} />);
    expect(screen.getByText(/Cotización por.*1,160\.00 USD/)).toBeInTheDocument();
  });
});

// The page of choices is not the source of truth for an existing relation.
describe("ProspectQuoteSelector — paged references", () => {
  const oldQuote = { id: "old-quote", quote_number: "COT-1102", customer_name: "Older customer", total: 100, status: "sent", currency: "USD" };
  const controls = () => ({ search: "", onSearchChange: vi.fn(), isLoading: false, isError: false, hasMore: true, onLoadMore: vi.fn(), onRetry: vi.fn(), linkedError: null as string | null, onRetryLinked: vi.fn() });

  it("pins the old quote while search/page changes and exposes explicit pagination", () => {
    const paging = controls();
    const onChange = vi.fn();
    const { rerender } = render(<ProspectQuoteSelector quoteId={oldQuote.id} onChange={onChange} matchingQuotes={[]} selectedQuote={oldQuote} controls={paging} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("COT-1102");
    fireEvent.change(screen.getByLabelText("Buscar cotización por folio o cliente"), { target: { value: "Other company" } });
    expect(paging.onSearchChange).toHaveBeenCalledWith("Other company");
    fireEvent.click(screen.getByRole("button", { name: "Cargar más cotizaciones" }));
    expect(paging.onLoadMore).toHaveBeenCalledOnce();
    rerender(<ProspectQuoteSelector quoteId={oldQuote.id} onChange={onChange} matchingQuotes={[]} selectedQuote={oldQuote} controls={{ ...paging, isLoading: true }} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("COT-1102");
    expect(screen.getByRole("button", { name: "Cargar más cotizaciones" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps an unavailable relation visible, surfaces retry, and unlinks only on explicit choice", async () => {
    const paging = { ...controls(), linkedError: "La cotización vinculada no está disponible." };
    const onChange = vi.fn();
    render(<ProspectQuoteSelector quoteId={oldQuote.id} onChange={onChange} matchingQuotes={[]} selectedQuote={null} controls={paging} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Cotización vinculada");
    expect(screen.getByText(paging.linkedError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verificar de nuevo" }));
    expect(paging.onRetryLinked).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Sin cotización" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("shows query failure and keeps the stored label rather than pretending there are zero quotes", () => {
    const paging = { ...controls(), isError: true, hasMore: false };
    render(<ProspectQuoteSelector quoteId={oldQuote.id} onChange={vi.fn()} matchingQuotes={[]} selectedQuote={oldQuote} controls={paging} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar");
    expect(screen.queryByText("Sin resultados para esta búsqueda.")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveTextContent("COT-1102");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar búsqueda" }));
    expect(paging.onRetry).toHaveBeenCalledOnce();
  });
});
