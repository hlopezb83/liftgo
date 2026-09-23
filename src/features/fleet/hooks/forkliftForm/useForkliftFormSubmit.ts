import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import {
  buildForkliftPayload,
  resolveEquipmentModelId,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "../../lib/forkliftPayload";
import { useCreateForklift, useUpdateForklift, useForklifts } from "../forklifts/useForklifts";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";
import type { EquipmentModel } from "../useEquipmentModels";

interface Args {
  id?: string;
  isEdit: boolean;
  /** M-11b: `updated_at` cargado en el formulario (bloqueo optimista). */
  expectedUpdatedAt?: string | null;
  equipmentModels?: EquipmentModel[];
}

export function useForkliftFormSubmit({ id, isEdit, expectedUpdatedAt, equipmentModels }: Args) {
  const navigate = useNavigateTransition();
  const create = useCreateForklift();
  const update = useUpdateForklift();
  const { data: allForklifts } = useForklifts();

  const onSubmit = (values: ForkliftFormData) => {
    const others = allForklifts?.filter((f) => f.id !== id) ?? [];
    const uniquenessError = validateForkliftUniqueness({ form: values, others });
    if (uniquenessError) {
      notifyError({ error: uniquenessError });
      return;
    }

    const equipmentModelId = resolveEquipmentModelId(values, equipmentModels);
    if (!equipmentModelId) {
      notifyError({ error: new Error("Selecciona un modelo habilitado y vuelve a intentar") });
      return;
    }
    const payload = buildForkliftPayload(values, equipmentModelId);
    const onError = (err: Error) => notifyError({ error: err, message: mapForkliftMutationError(err.message) });

    if (isEdit && id) {
      update.mutate({ id, expectedUpdatedAt, ...payload }, {
        onSuccess: () => { notifySuccess("Montacargas actualizado"); navigate(`/fleet/${id}`); },
        onError,
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { notifySuccess("Montacargas agregado"); navigate("/fleet"); },
        onError,
      });
    }
  };

  return { onSubmit, navigate, isPending: create.isPending || update.isPending };
}
