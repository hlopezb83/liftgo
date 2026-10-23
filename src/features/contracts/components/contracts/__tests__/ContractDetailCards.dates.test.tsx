import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContractDetailsCard } from "../ContractDetailCards";

const props = {
  startDate: "2026-01-01",
  endDate: "2026-02-28",
  depositAmount: 0,
  dailyRate: 0,
  weeklyRate: 0,
  monthlyRate: 0,
  signedBy: null,
};

afterEach(() => {
  cleanup();
});

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe(`contract dates distinguish civil dates from the signing instant (${timezone})`, () => {
  it.each([
    ["2026-01-01T05:59:59Z", "31/12/2025"],
    ["2026-01-01T06:00:00Z", "01/01/2026"],
    ["2026-10-23T00:30:00-06:00", "23/10/2026"],
  ])("uses Monterrey for signedAt %s", (signedAt, expected) => {
    render(<ContractDetailsCard {...props} signedAt={signedAt} />);
    expect(screen.getByText("Firmado").parentElement).toHaveTextContent(expected);
    // Contract dates are Postgres date values, not UTC instants.
    expect(screen.getByText("Inicio").parentElement).toHaveTextContent("01/01/2026");
    expect(screen.getByText("Fin").parentElement).toHaveTextContent("28/02/2026");
  });

  it("does not invent a signing date for an unsigned contract", () => {
    render(<ContractDetailsCard {...props} signedAt={null} />);
    expect(screen.queryByText("Firmado")).not.toBeInTheDocument();
  });
});
