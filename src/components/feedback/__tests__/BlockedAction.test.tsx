import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { BlockedActionButton } from "../BlockedActionButton";
import { BlockedActionNotice } from "../BlockedActionNotice";

const block = describeBusinessBlock("forklift_active_rental");

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("BlockedActionNotice", () => {
  it("muestra la jerarquía acción → motivo → siguiente paso", () => {
    renderWithRouter(<BlockedActionNotice block={block} />);
    expect(screen.getByText(block.action)).toBeInTheDocument();
    expect(screen.getByText(block.reason)).toBeInTheDocument();
    expect(screen.getByText(block.nextStep)).toBeInTheDocument();
  });

  it("renderiza detalle contextual y acción de resolución", () => {
    renderWithRouter(
      <BlockedActionNotice
        block={describeBusinessBlock("maintenance_open_damage")}
        details="Daño: fuga de aceite"
        link={{ label: "Resolver daño", to: "/damage" }}
      />,
    );
    expect(screen.getByText("Daño: fuga de aceite")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resolver daño/i })).toBeInTheDocument();
  });
});

describe("BlockedActionButton", () => {
  it("mantiene la acción visible pero deshabilitada cuando hay bloqueo", () => {
    const onClick = vi.fn();
    renderWithRouter(
      <BlockedActionButton block={block} onClick={onClick}>Vender</BlockedActionButton>,
    );
    const button = screen.getByRole("button", { name: "Vender" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("permite la acción cuando no hay bloqueo", () => {
    const onClick = vi.fn();
    renderWithRouter(
      <BlockedActionButton block={null} onClick={onClick}>Vender</BlockedActionButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
