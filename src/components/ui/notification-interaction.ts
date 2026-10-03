/** Toast actions belong to the current operation, even outside a modal portal. */
export function preserveToastInteraction<E extends Event>(event: E, onOutside?: (event: E) => void) {
  if (event.target instanceof Element && event.target.closest("[data-sonner-toaster]")) {
    event.preventDefault();
    return;
  }
  onOutside?.(event);
}
