import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRMKanbanGrid } from "../CRMKanbanGrid";
import { ACTIVE_STAGES } from "../../lib/constants";

afterEach(cleanup);

describe("CRMKanbanGrid — alta permitida", () => {
  it("sólo ofrece agregar en Nuevo Prospecto y conserva columnas vacías como destinos", () => {
    const onAdd = vi.fn();
    render(<CRMKanbanGrid
      isLoading={false}
      stagesData={ACTIVE_STAGES.map((stage) => ({ ...stage, items: [], total: 0 }))}
      pipelineTotal={0} density="comfortable" quoteMap={new Map()}
      canWrite
      onDragEnd={vi.fn()} onAdd={onAdd} onCardClick={vi.fn()}
    />);
    const ctas = screen.getAllByRole("button", { name: /Agregar|Clic para agregar/i });
    expect(ctas).toHaveLength(2);
    ctas.forEach((button) => fireEvent.click(button));
    expect(onAdd.mock.calls).toEqual([["nuevo_prospecto"], ["nuevo_prospecto"]]);
    for (const stage of ACTIVE_STAGES) {
      expect(screen.getByTestId(`crm-kanban-column-${stage.key}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Sin prospectos")).toHaveLength(4);
  });
  it("no ofrece acciones de alta al rol de solo lectura", () => {
    render(<CRMKanbanGrid
      isLoading={false}
      stagesData={ACTIVE_STAGES.map((stage) => ({ ...stage, items: [], total: 0 }))}
      pipelineTotal={0} density="comfortable" quoteMap={new Map()}
      canWrite={false}
      onDragEnd={vi.fn()} onAdd={vi.fn()} onCardClick={vi.fn()}
    />);
    expect(screen.queryByRole("button", { name: /Agregar|Clic para agregar/i })).not.toBeInTheDocument();
  });
});
