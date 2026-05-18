import { useParams } from "react-router-dom";
import { useForklift } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useForkliftFormState } from "./forkliftForm/useForkliftFormState";
import { useForkliftPrefill } from "./forkliftForm/useForkliftPrefill";
import { useForkliftFormSubmit } from "./forkliftForm/useForkliftFormSubmit";

export function useForkliftFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const { data: existing } = useForklift(id);

  const { form, set, setForm, equipmentModels, hasModels, manufacturers, filteredModels } =
    useForkliftFormState(existing);
  useForkliftPrefill(existing, setForm);
  const { handleSubmit, navigate, isPending } = useForkliftFormSubmit({ id, isEdit, form });

  const handleManufacturerChange = (value: string) => {
    setForm((prev) => ({ ...prev, manufacturer: value, model: "" }));
  };

  const handleModelChange = (value: string) => {
    const match = equipmentModels?.find((m) => m.manufacturer === form.manufacturer && m.model === value);
    setForm((prev) => ({
      ...prev,
      model: value,
      ...(match ? {
        capacity_kg: match.default_capacity_kg?.toString() ?? prev.capacity_kg,
        mast_height_m: match.default_mast_height_m?.toString() ?? prev.mast_height_m,
        fuel_type: match.default_fuel_type ?? prev.fuel_type,
      } : {}),
    }));
  };

  return {
    id, isEdit, navigate,
    form, set,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange, handleSubmit,
    isPending,
  };
}
