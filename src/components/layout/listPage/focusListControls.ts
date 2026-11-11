/** Resolve the currently mounted control in this list after filters reset. */
export function focusListControls(scope: HTMLElement | null) {
  if (!scope?.isConnected) return;
  const selectors = ['input[type="search"], [role="searchbox"]', '[data-list-filters-trigger]', 'select, [role="combobox"], [role="tab"]'];
  for (const selector of selectors) {
    for (const control of scope.querySelectorAll<HTMLElement>(selector)) {
      if (!isVisibleControl(control)) continue;
      control.focus();
      if (document.activeElement === control) return;
    }
  }
  scope.focus();
}

function isVisibleControl(control: HTMLElement) {
  if (control.matches(':disabled, [aria-disabled="true"]') || control.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = control; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}
