import { act, fireEvent, render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { describe, expect, it, vi } from "vitest";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { BlockedActionButton } from "../BlockedActionButton";
import { BlockedActionNotice } from "../BlockedActionNotice";

const block = describeBusinessBlock("forklift_active_rental");

function renderWithRouter(ui: React.ReactElement) {
  return render(<TestRouter>{ui}</TestRouter>);
}

describe("BlockedActionNotice", () => {
  it("muestra la jerarquía acción → motivo → siguiente paso", async () => {
    renderWithRouter(<BlockedActionNotice block={block} />);
    expect(await screen.findByText(block.action)).toBeInTheDocument();
    expect(screen.getByText(block.reason)).toBeInTheDocument();
    expect(screen.getByText(block.nextStep)).toBeInTheDocument();
  });

  it("renderiza detalle contextual y acción de resolución", async () => {
    renderWithRouter(
      <BlockedActionNotice
        block={describeBusinessBlock("maintenance_open_damage")}
        details="Daño: fuga de aceite"
        link={{ label: "Resolver daño", to: "/damage" }}
      />,
    );
    expect(await screen.findByText("Daño: fuga de aceite")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resolver daño/i })).toBeInTheDocument();
  });
});

describe("BlockedActionButton", () => {
  it("mantiene la acción visible e inactiva cuando hay bloqueo", async () => {
    const onClick = vi.fn();
    renderWithRouter(
      <BlockedActionButton block={block} onClick={onClick}>Vender</BlockedActionButton>,
    );
    const button = await screen.findByRole("button", { name: "Vender" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("permite consultar el motivo con teclado o tap", async () => {
    renderWithRouter(<BlockedActionButton block={block}>Vender</BlockedActionButton>);
    const button = await screen.findByRole("button", { name: "Vender" });
    await act(async () => { button.focus(); });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(block.nextStep);
  });

  it("permite la acción cuando no hay bloqueo", async () => {
    const onClick = vi.fn();
    renderWithRouter(
      <BlockedActionButton block={null} onClick={onClick}>Vender</BlockedActionButton>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Vender" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("el portal optativo %s conserva el bloqueo y su ubicación", async (portal) => {
    const onClick = vi.fn();
    renderWithRouter(
      <div data-testid="scroll-container" style={{ overflow: "hidden" }}>
        <BlockedActionButton block={block} portal={portal} onClick={onClick}>Vender</BlockedActionButton>
      </div>,
    );
    const container = await screen.findByTestId("scroll-container");
    const button = await screen.findByRole("button", { name: "Vender" });
    fireEvent.click(button);
    const tooltip = await screen.findByRole("tooltip");
    expect(container.contains(button)).toBe(true);
    expect(container.contains(tooltip)).toBe(!portal);
    expect(tooltip).toHaveTextContent(block.reason);
    expect(tooltip).toHaveTextContent(block.nextStep);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(onClick).not.toHaveBeenCalled();
  });
});
