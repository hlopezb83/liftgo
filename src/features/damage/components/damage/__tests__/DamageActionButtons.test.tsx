import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { DamageActionButtons } from "../DamageActionButtons";

const baseProps = {
  canManageDamage: true,
  canChargeDamage: true,
  canArchive: false,
  canCharge: false,
  costMissing: false,
  isCreatingWorkOrder: false,
  isUpdating: false,
  isArchiving: false,
  onCreateWorkOrder: vi.fn(),
  onMarkRepaired: vi.fn(),
  onCreateInvoice: vi.fn(),
  onArchive: vi.fn(),
};

describe("DamageActionButtons", () => {
  // F6: reported → repaired ya no es un callejón sin salida (antes solo
  // se ofrecía "Marcar reparado" en in_repair).
  it("muestra 'Marcar reparado' en status reported", () => {
    render(<DamageActionButtons status="reported" {...baseProps} />);
    expect(screen.getByRole("button", { name: /marcar reparado/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reparar/i })).toBeInTheDocument();
  });

  it("muestra 'Marcar reparado' en status in_repair (comportamiento previo intacto)", () => {
    render(<DamageActionButtons status="in_repair" {...baseProps} />);
    expect(screen.getByRole("button", { name: /marcar reparado/i })).toBeInTheDocument();
  });

  it("no muestra 'Marcar reparado' en status repaired ni invoiced", () => {
    render(<DamageActionButtons status="repaired" {...baseProps} />);
    expect(screen.queryByRole("button", { name: /marcar reparado/i })).not.toBeInTheDocument();
  });
});

describe("DamageActionButtons · archivar bloqueado", () => {
  it("mantiene 'Archivar' visible y deshabilitada con el bloqueo de negocio", () => {
    const onArchive = vi.fn();
    render(
      <DamageActionButtons
        status="reported"
        {...baseProps}
        onArchive={onArchive}
        archiveBlock={describeBusinessBlock("damage_not_repaired")}
      />,
    );
    const archive = screen.getByRole("button", { name: /archivar/i });
    expect(archive).toBeDisabled();
  });
});
