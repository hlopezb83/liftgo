import type { SupplierFormData } from "./supplierFormSchema";
import type { UseFormReturn } from "react-hook-form";

/** Parser input is a user edit, even though it did not come from a keystroke. */
export function applySupplierCsfPatch(
  form: Pick<UseFormReturn<SupplierFormData>, "getValues" | "setValue">,
  patch: Partial<SupplierFormData>,
) {
  const current = form.getValues();
  (Object.keys(patch) as (keyof SupplierFormData)[]).forEach((key) => {
    const value = patch[key];
    if (value !== undefined && value !== "" && value !== current[key]) {
      form.setValue(key, value, { shouldDirty: true });
    }
  });
}
