import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";

/**
 * R8-FE-18 (BL-R8-25): réplica de la lógica de FiscalBadge — verifica que el
 * estado fiscal se traduce vía STATUS_LABELS en vez de mostrar el enum crudo.
 */
function FiscalBadge({ cfdiStatus, status }: { cfdiStatus: string | null; status: string }) {
  if (cfdiStatus === "cancelled" || status === "cancelled")
    return <Badge variant="destructive">Cancelada</Badge>;
  if (cfdiStatus === "stamped") return <Badge>Timbrada</Badge>;
  if (status === "draft") return <Badge variant="outline">Borrador</Badge>;
  return <Badge variant="secondary">{STATUS_LABELS[status] ?? status}</Badge>;
}

describe("FiscalBadge - estado fiscal traducido (R8-FE-18)", () => {
  it("muestra 'Pagado' para una factura pagada sin timbrar (no el enum crudo)", () => {
    render(<FiscalBadge cfdiStatus={null} status="paid" />);
    expect(screen.getByText("Pagado")).toBeInTheDocument();
    expect(screen.queryByText("paid")).not.toBeInTheDocument();
  });

  it("mantiene 'Timbrada' cuando cfdi_status es stamped", () => {
    render(<FiscalBadge cfdiStatus="stamped" status="paid" />);
    expect(screen.getByText("Timbrada")).toBeInTheDocument();
  });

  it("mantiene 'Cancelada' cuando el status o cfdi_status es cancelled", () => {
    render(<FiscalBadge cfdiStatus={null} status="cancelled" />);
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
  });

  it("mantiene 'Borrador' para status draft", () => {
    render(<FiscalBadge cfdiStatus={null} status="draft" />);
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("cae al valor crudo si no hay traducción en STATUS_LABELS", () => {
    render(<FiscalBadge cfdiStatus={null} status="unknown_status" />);
    expect(screen.getByText("unknown_status")).toBeInTheDocument();
  });
});
