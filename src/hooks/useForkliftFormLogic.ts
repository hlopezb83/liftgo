import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  useForklift,
  useForklifts,
  useCreateForklift,
  useUpdateForklift,
} from "@/hooks/useForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useFormState } from "@/hooks/useFormState";
import { forkliftFormSchema, type ForkliftFormData } from "@/lib/formSchemas";
import {
  buildForkliftPayload,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "@/lib/forms/forkliftPayload";

const emptyForm: ForkliftFormData = {
  name: "", model: "", manufacturer: "", year: "", capacity_kg: "",
  mast_height_m: "", fuel_type: "Diesel", serial_number: "", status: "available",
  daily_rate: "", weekly_rate: "", monthly_rate: "", acquisition_cost: "", notes: "",
  insurance_provider: "", insurance_policy_number: "", insurance_expiry: "", insurance_cost: "",
};

export function useForkliftFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing } = useForklift(id);
  const { data: allForklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();
  const create = useCreateForklift();
  const update = useUpdateForklift();
  const { form, set, setForm } = useFormState(emptyForm);

  const hasModels = !!(equipmentModels && equipmentModels.length > 0);

  const manufacturers = useMemo(() => {
    if (!equipmentModels) return [];
    const set = new Set(equipmentModels.map((m) => m.manufacturer));
    if (existing?.manufacturer && !set.has(existing.manufacturer)) set.add(existing.manufacturer);
    return [...set].sort();
  }, [equipmentModels, existing]);

  const filteredModels = useMemo(() => {
    if (!equipmentModels || !form.manufacturer) return [];
    const models = equipmentModels.filter((m) => m.manufacturer === form.manufacturer);
    if (existing?.model && existing?.manufacturer === form.manufacturer && !models.some((m) => m.model === existing.model)) {
      models.push({
        id: "fallback", manufacturer: form.manufacturer, model: existing.model,
        default_capacity_kg: null, default_mast_height_m: null, default_fuel_type: "Diesel",
        default_daily_rate: 0, default_weekly_rate: 0, default_monthly_rate: 0,
        created_at: "", updated_at: "",
      });
    }
    return models;
  }, [equipmentModels, form.manufacturer, existing]);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        model: existing.model,
        manufacturer: existing.manufacturer || "",
        year: existing.year?.toString() || "",
        capacity_kg: existing.capacity_kg?.toString() || "",
        mast_height_m: existing.mast_height_m?.toString() || "",
        fuel_type: existing.fuel_type || "Diesel",
        serial_number: existing.serial_number || "",
        status: existing.status,
        daily_rate: existing.daily_rate?.toString() || "",
        weekly_rate: existing.weekly_rate?.toString() || "",
        monthly_rate: existing.monthly_rate?.toString() || "",
        acquisition_cost: existing.acquisition_cost?.toString() || "",
        notes: existing.notes || "",
        insurance_provider: (existing as any).insurance_provider || "",
        insurance_policy_number: (existing as any).insurance_policy_number || "",
        insurance_expiry: (existing as any).insurance_expiry || "",
        insurance_cost: (existing as any).insurance_cost?.toString() || "",
      });
    }
  }, [existing, equipmentModels]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = forkliftFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    const others = allForklifts?.filter((f) => f.id !== id) ?? [];
    const uniquenessError = validateForkliftUniqueness({ form, others });
    if (uniquenessError) {
      toast.error(uniquenessError);
      return;
    }

    const payload = buildForkliftPayload(form);
    const onError = (err: Error) => toast.error(mapForkliftMutationError(err.message));

    if (isEdit) {
      update.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Montacargas actualizado"); navigate(`/fleet/${id}`); },
        onError,
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast.success("Montacargas agregado"); navigate("/fleet"); },
        onError,
      });
    }
  };

  return {
    id, isEdit, navigate,
    form, set,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange, handleSubmit,
    isPending: create.isPending || update.isPending,
  };
}
