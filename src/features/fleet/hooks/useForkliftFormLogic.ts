import { useForm } from "react-hook-form";
import { useParams } from "react-router";
import { zodResolver } from "@/lib/forms/zodResolver";
import { forkliftFormSchema, type ForkliftFormData } from "../lib/forkliftFormSchema";
import { useForkliftFormState } from "./forkliftForm/useForkliftFormState";
import { useForkliftFormSubmit } from "./forkliftForm/useForkliftFormSubmit";
import { useForkliftPrefill } from "./forkliftForm/useForkliftPrefill";
import { useForklift } from "./forklifts/useForklifts";

const emptyForm: ForkliftFormData = {
  name: "", model: "", manufacturer: "", year: "", capacity_kg: "",
  mast_height_m: "", fuel_type: "Diesel", serial_number: "", status: "available",
  daily_rate: "", weekly_rate: "", monthly_rate: "", acquisition_cost: "", notes: "",
  insurance_provider: "", insurance_policy_number: "", insurance_expiry: "", insurance_cost: "",
};

export function useForkliftFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const { data: existing } = useForklift(id);

  const form = useForm<ForkliftFormData>({
    resolver: zodResolver(forkliftFormSchema),
    defaultValues: emptyForm,
  });

  const { equipmentModels, hasModels, manufacturers, filteredModels } =
    useForkliftFormState(form, existing);
  useForkliftPrefill(existing, form);
  const { onSubmit, navigate, isPending } = useForkliftFormSubmit({ id, isEdit });

  const handleManufacturerChange = (value: string) => {
    form.setValue("manufacturer", value, { shouldDirty: true });
    form.setValue("model", "", { shouldDirty: true });
  };

  const handleModelChange = (value: string) => {
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
  };
}
