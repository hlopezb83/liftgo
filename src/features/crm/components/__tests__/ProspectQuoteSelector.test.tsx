import { cleanup, render, screen } from "@testing-library/react";
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
