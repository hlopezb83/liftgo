// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
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

it("preserves a mouse click on a touch-capable device before any touch", () => {
  const { button, onActivate, onRefresh } = mountControl();
  fireEvent.mouseDown(button); fireEvent.mouseUp(button);
  fireEvent.click(button, { detail: 1 });
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(onRefresh).not.toHaveBeenCalled();
});

it("refreshes on a long touch pull, then still allows mouse clicks", async () => {
  const { button, onActivate, onRefresh } = mountControl();
  const touch = (y: number) => ({ identifier: 1, target: button, clientX: 100, clientY: y });
  fireEvent.touchStart(button, { touches: [touch(0)], targetTouches: [touch(0)], changedTouches: [touch(0)] });
  fireEvent.touchMove(button, { touches: [touch(200)], targetTouches: [touch(200)], changedTouches: [touch(200)] });
  await act(async () => {
    fireEvent.touchEnd(button, { touches: [], targetTouches: [], changedTouches: [touch(200)] });
  });
  expect(onRefresh).toHaveBeenCalledTimes(1);
  fireEvent.click(button, { detail: 1 });
  expect(onActivate).toHaveBeenCalledTimes(1);
});
