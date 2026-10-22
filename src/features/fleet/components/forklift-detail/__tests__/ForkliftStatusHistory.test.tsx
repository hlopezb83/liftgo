import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { ForkliftStatusHistory } from "../ForkliftStatusHistory";

const log: Tables<"status_logs"> = {
  id: "log-1",
  forklift_id: "equipment-demo",
  organization_id: "org-demo",
  changed_at: "2026-10-22T03:00:00Z",
  changed_by: "private-user-id",
  from_status: "available",
  to_status: "maintenance",
  note: "Revisión preventiva",
};
afterEach(cleanup);

describe("historial de estado", () => {
  it("presenta lista semántica, transición y fecha Monterrey, sin inventar responsables", () => {
    render(<ForkliftStatusHistory logs={[log]} />);
    const list = screen.getByRole("list", { name: "Cambios de estado" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Disponible")).toBeInTheDocument();
    expect(within(list).getByText("Mantenimiento")).toBeInTheDocument();
    expect(
      screen.getByText("21/10/2026 21:00").closest("time"),
    ).toHaveAttribute("datetime", log.changed_at);
    expect(screen.getByText("1 registro")).toBeInTheDocument();
    expect(screen.queryByText("private-user-id")).not.toBeInTheDocument();
    expect(screen.queryByText("Estado actual")).not.toBeInTheDocument();
  });
  it("conserva el orden de consulta, todas las entradas y la nota multilinea", () => {
    const note = `Entrega verificada\n${"a".repeat(300)}`;
    render(
      <ForkliftStatusHistory
        logs={[
          { ...log, note },
          {
            ...log,
            id: "log-0",
            from_status: null,
            to_status: "available",
            note: null,
          },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Entrega verificada");
    expect(rows[1]).toHaveTextContent("Sin estado anterior");
    expect(screen.getByText("2 registros")).toBeInTheDocument();
    const paragraph = rows[0].querySelector("p.whitespace-pre-wrap");
    expect(paragraph?.textContent).toBe(note);
    expect(paragraph).toHaveClass("break-words", "[overflow-wrap:anywhere]");
  });
  it.each([
    { entity: "Daño", id: "ba453704-0ecd-4556-beb1-5750b14ec035" },
    { entity: "Orden de trabajo", id: "53720a6d-3aea-4cbc-9daf-6aa7f1c76dbb" },
  ])("presenta $entity sin UUID y conserva referencia técnica original", ({ entity, id }) => {
    const note = `${entity} ${id}: actualización operativa`;
    render(<ForkliftStatusHistory logs={[{ ...log, note }]} />);
    expect(screen.getByText(`${entity}: actualización operativa`)).toBeVisible();
    const original = screen.getByText(note);
    const detail = original.closest("details");
    expect(detail).not.toHaveAttribute("open");
    expect(original).not.toBeVisible();
    expect(original).toHaveClass("break-words", "[overflow-wrap:anywhere]");
    expect(within(detail!).getByText("Ver referencia técnica")).toBeVisible();
    fireEvent.click(within(detail!).getByText("Ver referencia técnica"));
    expect(detail).toHaveAttribute("open");
    expect(original).toBeVisible();
    expect(original.textContent).toBe(note);
  });
  it.each([
    "Daño ba453704-0ecd-4556-beb1-5750b14ec03: actualización operativa",
    "Daño ga453704-0ecd-4556-beb1-5750b14ec035: actualización operativa",
    "Revisar daño ba453704-0ecd-4556-beb1-5750b14ec035: actualización operativa",
    "Daño ba453704-0ecd-4556-beb1-5750b14ec035: nota escrita por usuario",
    "Daño ba453704-0ecd-4556-beb1-5750b14ec035: actualización operativa\nNota adicional",
    "Daño ba453704-0ecd-4556-beb1-5750b14ec035: actualización operativa\n",
  ])("no modifica notas libres o referencias malformadas: %s", (note) => {
    render(<ForkliftStatusHistory logs={[{ ...log, note }]} />);
    const paragraph = screen.getByRole("listitem").querySelector("p.whitespace-pre-wrap");
    expect(paragraph?.textContent).toBe(note);
    expect(screen.queryByText("Ver referencia técnica")).not.toBeInTheDocument();
  });
  it("conserva estados desconocidos legibles", () => {
    render(
      <ForkliftStatusHistory logs={[{ ...log, to_status: "custom_state" }]} />,
    );
    expect(screen.getByText("Custom State")).toBeInTheDocument();
  });
  it("permite envolver estados históricos largos sin truncar su contenido", () => {
    const status = "estado_" + "x".repeat(150);
    render(<ForkliftStatusHistory logs={[{ ...log, to_status: status }]} />);
    const badge = screen.getByText("Estado " + "X" + "x".repeat(149));
    expect(badge.parentElement).toHaveClass("[&>div]:max-w-full", "[&>div]:whitespace-normal", "[&>div]:[overflow-wrap:anywhere]");
  });
  it("muestra vacío explicativo sólo tras completar consulta", () => {
    render(<ForkliftStatusHistory logs={[]} />);
    expect(
      screen.getByText("Sin cambios de estado registrados"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("distingue carga de vacío", () => {
    render(<ForkliftStatusHistory logs={[]} isLoading />);
    expect(
      screen.getByRole("status", { name: "Cargando historial de estado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sin cambios de estado registrados"),
    ).not.toBeInTheDocument();
  });
  it.each([{ logs: [] }, { logs: [log] }])(
    "oculta datos ausentes o cacheados al fallar consulta y permite reintento",
    ({ logs }) => {
      const retry = vi.fn();
      render(<ForkliftStatusHistory logs={logs} isError onRetry={retry} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No se pudo cargar el historial de estado",
      );
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Sin cambios de estado registrados"),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(retry).toHaveBeenCalledOnce();
    },
  );
  it("bloquea reintentos repetidos y recupera contenido después de éxito", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ForkliftStatusHistory logs={[]} isError isFetching onRetry={retry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentando…" }));
    expect(retry).not.toHaveBeenCalled();
    rerender(<ForkliftStatusHistory logs={[log]} onRetry={retry} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
