import { useRef } from "react";
import { useForm } from "react-hook-form";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useParams } from "@/lib/router-compat";
import { forkliftFormSchema, type ForkliftFormData } from "../lib/forkliftFormSchema";
import { useForkliftFormState } from "./forkliftForm/useForkliftFormState";
import { useForkliftFormSubmit } from "./forkliftForm/useForkliftFormSubmit";
import { useForkliftPrefill } from "./forkliftForm/useForkliftPrefill";
import { useForklift } from "./forklifts/useForklifts";
import { useEquipmentModels } from "./useEquipmentModels";

const emptyForm: ForkliftFormData = {
  name: "", model: "", manufacturer: "", year: "", capacity_kg: "",
  mast_height_m: "", fuel_type: "Diesel", serial_number: "", status: "available",
  daily_rate: "", weekly_rate: "", monthly_rate: "", acquisition_cost: "", notes: "",
  insurance_provider: "", insurance_policy_number: "", insurance_expiry: "", insurance_cost: "",
};

export function useForkliftFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const { data: existing, refetch } = useForklift(id);
  const { data: equipmentModels } = useEquipmentModels();

  const form = useForm<ForkliftFormData>({
    resolver: zodResolver(forkliftFormSchema),
    defaultValues: emptyForm,
  });
  const justSavedRef = useRef(false);
  const { isDirty } = form.formState;
  useUnsavedChangesGuard(() => isDirty && !justSavedRef.current);
  const onSaved = (values: ForkliftFormData) => {
    // The navigation blocker runs before reset's next render.
    justSavedRef.current = true;
    form.reset(values);
  };

  const session = useForkliftPrefill(id, existing, form, equipmentModels !== undefined, refetch);
  const { hasModels, manufacturers, filteredModels } = useForkliftFormState(form, session.record, equipmentModels);
  // The editable values and concurrency version advance only together.
  const { onSubmit, navigate, isPending } = useForkliftFormSubmit({
    id, isEdit, expectedUpdatedAt: session.record?.updated_at, equipmentModels, existing: session.record, onSaved,
  });

  const handleManufacturerChange = (value: string) => {
    // R14-C: value vacío = evento espurio de Radix (colección sin items al
    // momento del prefill). Ignorar para no borrar en cascada datos existentes.
    if (!value) return;
    form.setValue("manufacturer", value, { shouldDirty: true });
    form.setValue("model", "", { shouldDirty: true });
  };

  const handleModelChange = (value: string) => {
    if (!value) return; // R14-C: mismo guard anti-borrado espurio.
    const manufacturer = form.getValues("manufacturer");
    const match = equipmentModels?.find((m) => m.manufacturer === manufacturer && m.model === value);
    form.setValue("model", value, { shouldDirty: true });
    if (match) {
      if (match.default_capacity_kg != null) form.setValue("capacity_kg", String(match.default_capacity_kg), { shouldDirty: true });
      if (match.default_mast_height_m != null) form.setValue("mast_height_m", String(match.default_mast_height_m), { shouldDirty: true });
      if (match.default_fuel_type) form.setValue("fuel_type", match.default_fuel_type, { shouldDirty: true });
    }
  };

  return {
    id, isEdit, navigate,
    form,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange,
    onSubmit,
    isPending,
    reload: session.reload, isReloading: session.isReloading, hasServerChanges: session.hasServerChanges,
    awaitingRecord: isEdit && !session.record,
  };
}
