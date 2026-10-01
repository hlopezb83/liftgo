import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { applySupplierCsfPatch } from "../applySupplierCsfPatch";
import { emptySupplierFormData, type SupplierFormData } from "../supplierFormSchema";

describe("importación de CSF de proveedor", () => {
  it("marca los campos importados como cambios por guardar", () => {
    const { result } = renderHook(() => useForm<SupplierFormData>({ defaultValues: emptySupplierFormData }));
    expect(result.current.formState.isDirty).toBe(false);
    act(() => applySupplierCsfPatch(result.current, { name: "HYVA de México", rfc: "HME123456ABC" }));
    expect(result.current.getValues("name")).toBe("HYVA de México");
    expect(result.current.formState.isDirty).toBe(true);
  });
});
