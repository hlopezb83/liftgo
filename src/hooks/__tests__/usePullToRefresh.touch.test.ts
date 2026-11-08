// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

afterEach(() => { cleanup(); document.body.replaceChildren(); });

function mountControl() {
  const main = document.createElement("main");
  const button = document.createElement("button");
  main.append(button); document.body.append(main);
  const onActivate = vi.fn(), onRefresh = vi.fn();
  button.addEventListener("click", onActivate);
  const { result } = renderHook(() => usePullToRefresh({ target: main, onRefresh }));
  return { button, onActivate, onRefresh, result };
}

it("allows a real touch sequence to activate a list control without refreshing", () => {
  const { button, onActivate, onRefresh, result } = mountControl();
  expect("ontouchstart" in window).toBe(true);
  const touch = { identifier: 1, target: button, clientX: 100, clientY: 512 };
  fireEvent.touchStart(button, { touches: [touch], targetTouches: [touch], changedTouches: [touch] });
  fireEvent.touchEnd(button, { touches: [], targetTouches: [], changedTouches: [touch] });
  // Browsers emit this compatibility click after a tap. No gesture hooks are mocked.
  fireEvent.click(button, { detail: 1 });
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(onRefresh).not.toHaveBeenCalled();
  expect(result.current.pullDistance).toBe(0);
});

it("preserves keyboard activation before any touch gesture", () => {
  const { button, onActivate, onRefresh } = mountControl();
  fireEvent.click(button, { detail: 0 });
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(onRefresh).not.toHaveBeenCalled();
});
