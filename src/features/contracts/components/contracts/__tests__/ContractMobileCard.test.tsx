import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ContractMobileCard } from "../ContractMobileCard";

const contract = {
  id: "ct-1",
  contract_number: "CT-0001",
  status: "signed",
  customer_name: "Constructora Regia",
  forklift_name: "MC-005",
  start_date: "2026-01-01",
  end_date: "2026-06-01",
};

describe("ContractMobileCard Untranslated wrapping", () => {
  it("marks contract_number, customer and forklift name as translate=no", () => {
    const { container } = render(<ContractMobileCard contract={contract} onClick={() => {}} />);
    const nodes = container.querySelectorAll('[translate="no"]');
    const texts = Array.from(nodes).map((n) => n.textContent);
    expect(texts.some((t) => t?.includes("CT-0001"))).toBe(true);
    expect(texts.some((t) => t?.includes("Constructora Regia"))).toBe(true);
    expect(texts.some((t) => t?.includes("MC-005"))).toBe(true);
  });
});
