/** Restore an external opener only when dismissal has not already focused a destination. */
export function restoreModalFocus(event: Event, target: HTMLElement | null): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && active.isConnected && active !== target) {
    event.preventDefault();
    return;
  }
  if (!target?.isConnected || target.matches(":disabled, [aria-disabled='true']") || target.closest("[hidden], [inert]")) return;
  const style = window.getComputedStyle(target);
  if (!target.getClientRects().length || style.display === "none" || style.visibility === "hidden") return;
  event.preventDefault();
  target.focus({ preventScroll: true });
}
