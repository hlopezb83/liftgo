import { render, screen, fireEvent, within } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { describe, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { QuoteDetailActions } from "@/features/quotes/components/quotes/QuoteDetailActions";

vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: any) => <>{children}</> }));
vi.mock("@/features/quotes/components/quotes/QuotePDFButton", () => ({ QuotePDFButton: () => <button>PDF</button> }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));

const quote = { id: "q-1", quote_number: "COT-0001", status: "sent", quote_type: "rental", valid_until: "2099-12-31", accepted_at: null } as unknown as Tables<"quotes">;

describe("debug", () => {
  it("x", () => {
    render(<BrowserRouter><QuoteDetailActions quote={quote} isSale={false} alreadyConverted={false} alreadyInvoiced={false} isConverting={false} canInvoice={false} onSetStatus={vi.fn()} onConvertClick={vi.fn()} onDelete={vi.fn()} /></BrowserRouter>);
    fireEvent.click(screen.getByRole("button", { name: /rechazar/i }));
    screen.debug(undefined, 30000);
  });
});
