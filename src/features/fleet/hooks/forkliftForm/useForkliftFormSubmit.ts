
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

import { useCreateForklift, useUpdateForklift, useForklifts } from "../forklifts/useForklifts";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";
import {
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
  buildForkliftPayload,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "../../lib/forkliftPayload";

interface Args {
  id?: string;
  isEdit: boolean;
}

export function useForkliftFormSubmit({ id, isEdit }: Args) {
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

    const payload = buildForkliftPayload(values);
    const onError = (err: Error) => notifyError({ error: err, message: mapForkliftMutationError(err.message) });

    if (isEdit && id) {
      update.mutate({ id, ...payload }, {
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
