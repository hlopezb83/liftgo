// @vitest-environment jsdom
import { act, fireEvent, within, waitFor } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), resetPassword: vi.fn(), navigate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, signIn: mocks.signIn, resetPassword: mocks.resetPassword }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => mocks.navigate }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
import PortalLogin from "./PortalLogin";

describe("portal SSR delayed hydration", () => {
  it("keeps SSR controls disabled until the delayed component hydrates, then handles the first recovery click", async () => {
    let release!: (module: { default: typeof PortalLogin }) => void;
    const DelayedPortal = lazy(() => new Promise<{ default: typeof PortalLogin }>((resolve) => { release = resolve; }));
    const host = document.createElement("div");
    host.innerHTML = renderToString(<Suspense fallback={null}><PortalLogin /></Suspense>);
    document.body.append(host);
    const ui = within(host);
    let root: Root | undefined;
    const errors: unknown[] = [];
    try {
      for (const control of host.querySelectorAll("input, button")) expect(control).toBeDisabled();
      expect(ui.getByRole("group")).toHaveAttribute("aria-busy", "true");
      // A native pre-hydration click cannot change the DOM or submit a form.
      (ui.getByRole("button", { name: "¿Olvidaste tu contraseña?" }) as HTMLButtonElement).click();
      expect(ui.getByText("Portal de clientes")).toBeVisible();
      act(() => { root = hydrateRoot(host, <Suspense fallback={null}><DelayedPortal /></Suspense>, { onRecoverableError: (error) => errors.push(error) }); });
      for (const control of host.querySelectorAll("input, button")) expect(control).toBeDisabled();
      await act(async () => { release({ default: PortalLogin }); });
      await waitFor(() => expect(ui.getByRole("group")).toHaveAttribute("aria-busy", "false"));
      for (const control of host.querySelectorAll("input, button")) expect(control).toBeEnabled();
      fireEvent.click(ui.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
      expect(ui.getByText("Restablecer contraseña")).toBeVisible();
      expect(ui.queryByLabelText("Contraseña")).not.toBeInTheDocument();
      fireEvent.click(ui.getByRole("button", { name: "Volver a iniciar sesión" }));
      expect(ui.getByLabelText("Contraseña")).toBeEnabled();
      fireEvent.click(ui.getByRole("button", { name: "Acceso empleados" }));
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/");
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.resetPassword).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    } finally {
      await act(async () => root?.unmount());
      host.remove();
    }
  });
});
