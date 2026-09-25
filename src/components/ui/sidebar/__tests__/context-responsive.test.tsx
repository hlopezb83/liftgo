import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "../context";

const viewport = vi.hoisted(() => ({ compact: true }));
vi.mock("@/hooks/use-mobile", () => ({
  useIsTabletOrBelow: () => false,
  useIsCompactDesktop: () => viewport.compact,
}));

function SidebarState() {
  const { state, toggleSidebar } = useSidebar();
  return (
    <>
      <output data-testid="sidebar-state">{state}</output>
      <button type="button" onClick={toggleSidebar}>Alternar</button>
    </>
  );
}

const provider = () => <SidebarProvider><SidebarState /></SidebarProvider>;

afterEach(() => { viewport.compact = true; });

describe("SidebarProvider responsive", () => {
  it("starts collapsed at compact desktop and preserves a manual expansion until the breakpoint changes", () => {
    const { rerender } = render(provider());
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");

    fireEvent.click(screen.getByRole("button", { name: "Alternar" }));
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
    rerender(provider());
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    viewport.compact = false;
    rerender(provider());
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");

    viewport.compact = true;
    rerender(provider());
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
  });

  it("starts expanded on a wide desktop", () => {
    viewport.compact = false;
    render(provider());
    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
  });
});
