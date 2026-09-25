import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "../OfflineBanner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("muestra el estado inicial offline sin esperar un evento", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión");
  });

  it("actualiza la conectividad y elimina las suscripciones al desmontar", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => {
      online.mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      online.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const onlineListener = add.mock.calls.find(([event]) => event === "online")?.[1];
    const offlineListener = add.mock.calls.find(([event]) => event === "offline")?.[1];
    expect(onlineListener).toBeTypeOf("function");
    expect(offlineListener).toBeTypeOf("function");
    unmount();
    expect(remove).toHaveBeenCalledWith("online", onlineListener);
    expect(remove).toHaveBeenCalledWith("offline", offlineListener);
  });

  it("hidrata el HTML del servidor sin discrepancias aunque el cliente esté offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(<OfflineBanner />);
    expect(container.innerHTML).toBe("");
    document.body.appendChild(container);
    render(<OfflineBanner />, { container, hydrate: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión");
    expect(error).not.toHaveBeenCalled();
  });
});
