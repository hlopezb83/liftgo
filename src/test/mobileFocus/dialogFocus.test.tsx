import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useLayoutEffect, useRef, useState, type AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar/context";
import { Sidebar, SidebarTrigger } from "@/components/ui/sidebar/Sidebar";
import { GlobalSearch } from "@/features/system/components/GlobalSearch";
import { restoreModalFocus } from "@/lib/ui/restoreModalFocus";
import { SidebarBranding } from "@/layouts/sidebar/SidebarBranding";
import { SidebarNavSection } from "@/layouts/sidebar/SidebarNavSection";

const state = vi.hoisted(() => ({ navigate: vi.fn(), notifyError: vi.fn() }));
// Only viewport, data and routing are stubbed. Both Radix dialogs and cmdk
// remain real so their close-autofocus lifecycle is exercised.
vi.mock("@/hooks/use-mobile", () => ({
  useIsTabletOrBelow: () => true,
  useIsCompactDesktop: () => false,
}));
vi.mock("@/features/users", () => ({
  getNavigationAccessLevel: () => "full",
  useHasFinancialAccess: () => true,
  useUserRole: () => ({ data: "admin" }),
  useRolePermissions: () => ({ data: {} }),
}));
vi.mock("@/features/changelog", () => ({ useCurrentVersion: () => "test" }));
vi.mock("@/layouts/sidebar/useSidebarBadgeCounts", () => ({ useSidebarBadgeCounts: () => ({ data: {} }) }));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ pathname: "/" }) }));
vi.mock("@/lib/router-compat-ui", () => ({
  Link: ({ to, activeOptions: _activeOptions, onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; activeOptions?: unknown }) =>
    <a href={to} {...props} onClick={(event) => {
      onClick?.(event);
      event.preventDefault();
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) state.navigate(to);
    }}>{children}</a>,
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: state.notifyError }));
vi.mock("@/app-routes/routes-config", () => ({ routeLoaders: {} }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/features/system/hooks/useEntitySearch", () => ({
  useEntitySearch: () => ({ data: undefined, isFetching: false }),
}));

function Destination() {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { ref.current?.focus(); }, []);
  return <h1 ref={ref} tabIndex={-1}>Destino</h1>;
}

function SidebarHarness({ triggerKey = "initial", showTrigger = true, mountDestination = true }: { triggerKey?: string; showTrigger?: boolean; mountDestination?: boolean }) {
  const [navigated, setNavigated] = useState(false);
  useLayoutEffect(() => {
    state.navigate.mockImplementation(() => setNavigated(true));
    return () => { state.navigate.mockReset(); };
  }, []);
  return <SidebarProvider>
    {showTrigger && <SidebarTrigger key={triggerKey} />}
    <Sidebar>
      <SidebarBranding />
      <SidebarNavSection group={{ label: "Operación", items: [{ title: "Reservas", url: "/bookings", icon: () => null }] }} />
    </Sidebar>
    {navigated && mountDestination && <Destination />}
  </SidebarProvider>;
}

function SearchNavigationHarness() {
  const [navigated, setNavigated] = useState(false);
  useLayoutEffect(() => {
    state.navigate.mockImplementation(() => setNavigated(true));
    return () => { state.navigate.mockReset(); };
  }, []);
  return <><GlobalSearch />{navigated && <Destination />}</>;
}

function markVisible(target: HTMLElement) {
  // happy-dom has no layout. Only the persistent opener's geometry is supplied.
  vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
  return target;
}

async function openDialog(trigger: HTMLElement, shortcut?: string) {
  markVisible(trigger);
  act(() => trigger.focus());
  if (shortcut) fireEvent.keyDown(trigger, { key: shortcut, ctrlKey: true });
  else fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  return dialog;
}

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  // Radix dispatches closeAutoFocus in the FocusScope cleanup timeout.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

async function closeWithEscape(trigger?: HTMLElement) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await expectClosed();
  if (trigger) await waitFor(() => expect(trigger).toHaveFocus());
}

beforeEach(() => { state.navigate.mockReset(); state.notifyError.mockReset(); });

describe("mobile modal focus restoration with real Radix", () => {
  it("gives the actual mobile sidebar an accessible name", async () => {
    render(<SidebarHarness />);
    const dialog = await openDialog(screen.getByRole("button", { name: "Alternar barra lateral" }));
    expect(dialog).toHaveAccessibleName("Menú principal");
  });

  it("gives actual quick navigation an accessible name", async () => {
    render(<GlobalSearch />);
    const dialog = await openDialog(screen.getByRole("button", { name: "Navegación rápida" }));
    expect(dialog).toHaveAccessibleName("Navegación rápida");
  });

  it.each(["click", "shortcut"])("returns focus to the mobile sidebar opener after Escape (%s)", async (method) => {
    render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    for (let cycle = 0; cycle < 3; cycle++) {
      await openDialog(trigger, method === "shortcut" ? "b" : undefined);
      await closeWithEscape(trigger);
    }
  });

  it("resolves the current sidebar trigger after the header remounts", async () => {
    const { rerender } = render(<SidebarHarness />);
    const initial = screen.getByRole("button", { name: "Alternar barra lateral" });
    await openDialog(initial);
    const staleFocus = vi.spyOn(initial, "focus");
    rerender(<SidebarHarness triggerKey="responsive-header" />);
    const current = markVisible(screen.getByRole("button", { name: "Alternar barra lateral", hidden: true }));
    expect(initial.isConnected).toBe(false);
    await closeWithEscape(current);
    expect(staleFocus).not.toHaveBeenCalled();
  });

  it("does not focus a sidebar opener removed while the sheet was open", async () => {
    const { rerender } = render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    await openDialog(trigger);
    const staleFocus = vi.spyOn(trigger, "focus");
    rerender(<SidebarHarness showTrigger={false} />);
    await closeWithEscape();
    expect(staleFocus).not.toHaveBeenCalled();
  });

  it("does not steal the destination focus when sidebar navigation closes the sheet", async () => {
    render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    const dialog = await openDialog(trigger);
    const triggerFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(within(dialog).getByRole("link", { name: "Reservas" }));
    // Route focus runs after the modal has left the DOM, before close autofocus.
    act(() => screen.getByRole("heading", { name: "Destino" }).focus());
    await expectClosed();
    expect(screen.getByRole("heading", { name: "Destino" })).toHaveFocus();
    expect(triggerFocus).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }], ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }], ["Alt", { altKey: true }], ["middle button", { button: 1 }],
  ])("keeps the sidebar open for a modified %s navigation", async (_name, modifiers) => {
    render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    const dialog = await openDialog(trigger);
    fireEvent.click(within(dialog).getByRole("link", { name: "Reservas" }), modifiers);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(state.navigate).not.toHaveBeenCalled();
    await closeWithEscape(trigger);
  });

  it("restores focus when the real sidebar branding close button dismisses the sheet", async () => {
    render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    const dialog = await openDialog(trigger);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar menú" }));
    await expectClosed();
    expect(trigger).toHaveFocus();
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("does not focus the sidebar opener while a selected route is still loading", async () => {
    render(<SidebarHarness mountDestination={false} />);
    const trigger = screen.getByRole("button", { name: "Alternar barra lateral" });
    const dialog = await openDialog(trigger);
    const triggerFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(within(dialog).getByRole("link", { name: "Reservas" }));
    await expectClosed();
    expect(triggerFocus).not.toHaveBeenCalled();
    await openDialog(trigger);
    await closeWithEscape(trigger);
  });

  it.each(["click", "shortcut"])("returns focus to quick navigation after Escape (%s)", async (method) => {
    render(<GlobalSearch />);
    const trigger = screen.getByRole("button", { name: "Navegación rápida" });
    for (let cycle = 0; cycle < 3; cycle++) {
      await openDialog(trigger, method === "shortcut" ? "k" : undefined);
      await closeWithEscape(trigger);
    }
  });

  it("returns focus after closing quick navigation with its close button", async () => {
    render(<GlobalSearch />);
    const trigger = screen.getByRole("button", { name: "Navegación rápida" });
    const dialog = await openDialog(trigger);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await expectClosed();
    expect(trigger).toHaveFocus();
  });

  it("returns focus and reports an error when quick navigation fails", async () => {
    const failure = new Error("Navigation failed");
    state.navigate.mockImplementation(() => { throw failure; });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<GlobalSearch />);
      const trigger = screen.getByRole("button", { name: "Navegación rápida" });
      const dialog = await openDialog(trigger);
      fireEvent.click(within(dialog).getByRole("option", { name: "Reservas" }));
      await expectClosed();
      expect(trigger).toHaveFocus();
      expect(state.notifyError).toHaveBeenCalledWith(expect.objectContaining({ error: failure, severity: "warning" }));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not restore a removed quick navigation opener", async () => {
    const { unmount } = render(<GlobalSearch />);
    const trigger = screen.getByRole("button", { name: "Navegación rápida" });
    await openDialog(trigger);
    const staleFocus = vi.spyOn(trigger, "focus");
    unmount();
    await expectClosed();
    expect(staleFocus).not.toHaveBeenCalled();
  });

  it("leaves focus with the destination after quick navigation selects a route", async () => {
    render(<SearchNavigationHarness />);
    const trigger = screen.getByRole("button", { name: "Navegación rápida" });
    const dialog = await openDialog(trigger);
    const triggerFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(within(dialog).getByRole("option", { name: "Reservas" }));
    await expectClosed();
    expect(state.navigate).toHaveBeenCalledWith("/bookings");
    expect(screen.getByRole("heading", { name: "Destino" })).toHaveFocus();
    expect(triggerFocus).not.toHaveBeenCalled();
    // A later dismissal is no longer a navigation and must restore the opener.
    await openDialog(trigger);
    await closeWithEscape(trigger);
  });
});

describe("invalid modal focus destinations", () => {
  it.each(["missing", "detached", "disabled", "aria-disabled", "hidden", "no-layout", "invisible"])(
    "ignores a %s opener", (kind) => {
      const target = document.createElement("button");
      document.body.append(target);
      markVisible(target);
      if (kind === "detached") target.remove();
      if (kind === "disabled") target.disabled = true;
      if (kind === "aria-disabled") target.setAttribute("aria-disabled", "true");
      if (kind === "hidden") target.hidden = true;
      if (kind === "no-layout") vi.mocked(target.getClientRects).mockReturnValue([] as unknown as DOMRectList);
      if (kind === "invisible") target.style.visibility = "hidden";
      const focus = vi.spyOn(target, "focus");
      const event = new Event("closeAutoFocus", { cancelable: true });
      restoreModalFocus(event, kind === "missing" ? null : target);
      expect(focus).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      target.remove();
    },
  );
});
