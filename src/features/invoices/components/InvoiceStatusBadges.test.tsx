import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvoiceStatusBadges } from "./InvoiceStatusBadges";

describe("Cobro and CFDI remain independent", () => {
  it.each([
    ["sent", "stamped", null, "Sin pagar", "Timbrada"],
    ["partial", "stamped", null, "Parcial", "Timbrada"],
    ["paid", "pending", null, "Pagado", "Sin timbrar"],
    ["overdue", "error", null, "Vencido", "Error de timbrado"],
    ["draft", "stamping", null, "Borrador", "Timbrando…"],
    ["partial", "stamped", "pending", "Parcial", "Cancelación en proceso"],
    ["paid", "stamped", "accepted", "Pagado", "Cancelada"],
    ["sent", "cancelled", null, "Sin pagar", "Cancelada"],
    ["sent", "cancelled", "pending", "Sin pagar", "Cancelada"],
    ["sent", null, "pending", "Sin pagar", "Cancelación en proceso"],
    ["cancelled", "stamped", null, "Cancelado", "Timbrada"],
    ["sent", "stamped", "rejected", "Sin pagar", "Timbrada"],
    ["sent", null, null, "Sin pagar", "Sin timbrar"],
    ["sent", "future-state", null, "Sin pagar", "Estado sin confirmar"],
  ])("%s / %s / %s", (invoiceStatus, cfdiStatus, cancellationStatus, collection, fiscal) => {
    render(<InvoiceStatusBadges {...{ invoiceStatus, cfdiStatus, cancellationStatus }} />);
    expect(within(screen.getByRole("group", { name: "Cobro" })).getByText(collection)).toBeVisible();
    expect(within(screen.getByRole("group", { name: "CFDI" })).getByText(fiscal)).toBeVisible();
  });
});
