import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoricalReconciliationCard } from "../HistoricalReconciliationCard";
import { reconciliation } from "../../../lib/__tests__/historicalReconciliation.fixture";

describe("HistoricalReconciliationCard", () => {
  it("explains the administrative nature and never renders arbitrary evidence", () => {
    render(<HistoricalReconciliationCard reconciliation={{ ...reconciliation, evidence: { description: "Reserva cerrada", secret_amount: "DO NOT SHOW" } }} />);
    expect(screen.getByText("Conciliada históricamente")).toBeInTheDocument();
    expect(screen.getByText("Fecha de referencia autorizada")).toBeInTheDocument();
    expect(screen.getByText(/no acredita una nueva entrega física/)).toBeInTheDocument();
    expect(screen.queryByText("DO NOT SHOW")).not.toBeInTheDocument();
  });
  it("shows revoked history honestly", () => {
    render(<HistoricalReconciliationCard reconciliation={{ ...reconciliation, revoked_at: "2026-11-06", revocation_reason: "Corrección autorizada" }} />);
    expect(screen.getByText("Conciliación revocada")).toBeInTheDocument();
    expect(screen.getByText("Corrección autorizada")).toBeInTheDocument();
  });
});
