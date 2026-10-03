import { QueryObserver } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "@/lib/query/appQueryClient";
import { refreshCalendarQueries } from "./refreshCalendarQueries";

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: feedback }));
vi.mock("@/lib/auth/sessionExpiry", () => ({ handleSessionExpired: vi.fn(async () => false) }));
vi.mock("@/lib/observability/captureOperationalError", () => ({ captureOperationalError: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe("refreshCalendarQueries", () => {
  it("un refetch fallido deja sólo el aviso global con la causa original", async () => {
    const client = createAppQueryClient();
    const cause = new Error("Servicio de calendario no disponible");
    const query = new QueryObserver(client, {
      queryKey: ["calendar-maintenance-windows"], enabled: false, retry: false,
      queryFn: async () => { throw cause; },
    });
    await expect(refreshCalendarQueries([() => query.refetch()])).resolves.toBeUndefined();
    await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    const [title, options] = feedback.error.mock.calls[0];
    expect(title).toBe("No se pudo cargar la información");
    expect(options.action.props.report.errorDetails.message).toBe(cause.message);
    expect(feedback.success).not.toHaveBeenCalled();
    query.destroy();
    client.clear();
  });

  it("confirma éxito sólo cuando todas las consultas se actualizaron", async () => {
    const first = vi.fn(async () => ({ isError: false }));
    const second = vi.fn(async () => ({ isError: false }));
    await refreshCalendarQueries([first, second]);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(feedback.success).toHaveBeenCalledWith("Calendario actualizado", expect.anything());
    expect(feedback.error).not.toHaveBeenCalled();
  });

  it("maneja un rechazo inesperado de la tarea sin dejar una promesa rechazada", async () => {
    const cause = new Error("Tarea interrumpida");
    await expect(refreshCalendarQueries([async () => { throw cause; }])).resolves.toBeUndefined();
    expect(feedback.error).toHaveBeenCalledOnce();
    expect(feedback.error.mock.calls[0][1].action.props.report.errorDetails.message).toBe(cause.message);
    expect(feedback.success).not.toHaveBeenCalled();
  });
});
