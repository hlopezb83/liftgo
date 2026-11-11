import { createContext, useContext } from "react";

export const FormErrorScope = createContext<string | undefined>(undefined);

export function useFormErrorTarget(name?: string) {
  const scope = useContext(FormErrorScope);
  return scope && name ? `${scope}-field-${encodeURIComponent(name)}` : undefined;
}

/** Prefer a live enabled control; a group error can focus its own anchor. */
export function focusFormErrorTarget(target: HTMLElement) {
  const selector = 'input:not([type="hidden"]),textarea,select,button,a[href],[role="combobox"],[tabindex]:not([tabindex="-1"])';
  const controls = [ ...(target.matches('input,textarea,select,button') ? [target] : []), ...target.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => !element.matches(':disabled,[aria-disabled="true"]') && !element.closest('[hidden],[aria-hidden="true"]'));
  const control = controls.find((element) => element.getAttribute("aria-invalid") === "true") ?? controls[0] ?? target;
  control.focus();
}
