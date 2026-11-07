import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prospect } from "../../lib/prospectTypes";
import { ProspectCardExpanded } from "../ProspectCardParts";
import { ProspectQuoteLink } from "../prospectDetail/ProspectInfoBlocks";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => navigate }));
afterEach(() => { cleanup(); navigate.mockReset(); });
const prospect = { quoteId: "old-quote-id", companyName: "CRM company", dealValueLabel: "$100" } as Prospect;

describe("CRM relation labels independent of a retrieved quote number", () => {
  it("keeps a generic stored-reference label until hydration, without inventing a folio", () => {
    const { rerender } = render(<ProspectCardExpanded prospect={prospect} />);
    expect(screen.getByText("Cotización vinculada")).toBeInTheDocument();
    expect(screen.queryByText(/COT-/)).toBeNull();
    rerender(<ProspectCardExpanded prospect={prospect} quoteNumber="COT-1102" />);
    expect(screen.getByText("COT-1102")).toBeInTheDocument();
  });

  it("keeps the detail reference navigable through the ordinary authorized detail route", () => {
    const onNavigate = vi.fn();
    render(<ProspectQuoteLink prospect={prospect} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Ver cotización vinculada"));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/quotes/old-quote-id");
  });
});
