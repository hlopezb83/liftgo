import type { MouseEvent } from "react";

/** Pointer convenience must never consume an embedded control's own action. */
export function canActivateTableRow(event: MouseEvent<HTMLTableRowElement>): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  return target instanceof Element && !target.closest(
    'a, button, input, select, textarea, label, summary, [role="button"], [role="checkbox"], [role="switch"], [role="combobox"], [role="menuitem"], [contenteditable="true"]',
  );
}
