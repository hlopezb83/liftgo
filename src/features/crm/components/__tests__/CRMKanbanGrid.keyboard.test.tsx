import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ACTIVE_STAGES } from "../../lib/constants";
import type { Prospect } from "../../lib/prospectTypes";
import { CRMKanbanGrid } from "../CRMKanbanGrid";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => navigate }));
const prospect = { id: "prospect-a", stage: "nuevo_prospecto", companyName: "Empresa QA", dealValueLabel: "$100", quoteId: "quote-a" } as Prospect;
function mount(canWrite = true, density: "compact" | "comfortable" = "comfortable") {
  const onCardClick = vi.fn();
  const onDragEnd = vi.fn();
  render(<CRMKanbanGrid isLoading={false} stagesData={ACTIVE_STAGES.map(stage => ({ ...stage, items: stage.key === prospect.stage ? [prospect] : [], total: 100 }))}
    pipelineTotal={100} density={density} quoteMap={new Map([["quote-a", "COT-QA"]])}
    canWrite={canWrite} onDragEnd={onDragEnd} onCardClick={onCardClick} onAdd={vi.fn()} />);
  return { onCardClick, onDragEnd };
}
const openButton = () => screen.getByRole("button", { name: "Ver prospecto Empresa QA" });
const handle = () => screen.getByRole("button", { name: "Mover prospecto Empresa QA" });

beforeEach(() => {
  navigate.mockReset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.dataset.testid ?? "";
    const stageIndex = ACTIVE_STAGES.findIndex(stage => id === `crm-kanban-column-${stage.key}`);
    const left = stageIndex >= 0 ? stageIndex * 280 : 8;
    const top = stageIndex >= 0 ? 100 : 108;
    return { left, top, width: 260, height: stageIndex >= 0 ? 400 : 90, right: left + 260, bottom: top + (stageIndex >= 0 ? 400 : 90), x: left, y: top, toJSON: () => ({}) };
  });
});
afterEach(() => { vi.restoreAllMocks(); });

it.each(["compact", "comfortable"] as const)("read access exposes a native open button and no drag handle in %s density", (density) => {
  const callbacks = mount(false, density);
  expect(openButton().tagName).toBe("BUTTON");
  expect(screen.queryByRole("button", { name: "Mover prospecto Empresa QA" })).not.toBeInTheDocument();
  const card = screen.getByTestId("crm-kanban-card-prospect-a");
  expect(card).not.toHaveAttribute("role", "button");
  expect(openButton()).not.toHaveAttribute("aria-roledescription", "sortable");
  fireEvent.keyDown(openButton(), { key: "Enter", code: "Enter" });
  fireEvent.click(openButton());
  expect(callbacks.onCardClick).toHaveBeenCalledExactlyOnceWith(prospect);
  fireEvent.keyDown(card, { key: " ", code: "Space" });
  fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
  fireEvent.keyDown(document, { key: " ", code: "Space" });
  expect(callbacks.onDragEnd).not.toHaveBeenCalled();
});

it("separates opening, dragging and the linked quote action", () => {
  const callbacks = mount();
  expect(openButton().contains(handle())).toBe(false);
  fireEvent.click(screen.getByText("COT-QA"));
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/quotes/quote-a");
  expect(callbacks.onCardClick).not.toHaveBeenCalled();
  fireEvent.click(handle());
  expect(callbacks.onCardClick).not.toHaveBeenCalled();
  fireEvent.keyDown(openButton(), { key: "Enter", code: "Enter" });
  expect(handle()).not.toHaveAttribute("aria-pressed", "true");
  fireEvent.click(openButton());
  expect(callbacks.onCardClick).toHaveBeenCalledExactlyOnceWith(prospect);
  expect(callbacks.onDragEnd).not.toHaveBeenCalled();
});

it("moves a prospect between columns with the real keyboard sensor without opening it", async () => {
  const callbacks = mount();
  handle().focus();
  fireEvent.keyDown(handle(), { key: " ", code: "Space" });
  await waitFor(() => expect(handle()).toHaveAttribute("aria-pressed", "true"));
  fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
  await waitFor(() => expect(screen.getByTestId("crm-kanban-column-contactado")).toHaveClass("bg-accent/30"));
  fireEvent.keyDown(document, { key: " ", code: "Space" });
  await waitFor(() => expect(callbacks.onDragEnd).toHaveBeenCalledOnce());
  expect(callbacks.onDragEnd.mock.calls[0][0]).toMatchObject({ active: { id: "prospect-a" }, over: { id: "contactado" } });
  expect(callbacks.onCardClick).not.toHaveBeenCalled();
});

it("cancels keyboard dragging with Escape and restores focus to the handle", async () => {
  const callbacks = mount();
  handle().focus();
  fireEvent.keyDown(handle(), { key: " ", code: "Space" });
  await waitFor(() => expect(handle()).toHaveAttribute("aria-pressed", "true"));
  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(handle()).not.toHaveAttribute("aria-pressed", "true"));
  expect(handle()).toHaveFocus();
  expect(callbacks.onDragEnd).not.toHaveBeenCalled();
  expect(callbacks.onCardClick).not.toHaveBeenCalled();
});
