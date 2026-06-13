import { useNavigate } from "react-router-dom";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";
import { useCreateForklift, useUpdateForklift, useForklifts } from "../forklifts/useForklifts";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";
import {
  buildForkliftPayload,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "../../lib/forkliftPayload";

interface Args {
  id?: string;
  isEdit: boolean;
}

export function useForkliftFormSubmit({ id, isEdit }: Args) {
  const navigate = useNavigate();
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
    const onError = (err: Error) => notifyError({ message: mapForkliftMutationError(err.message) });

    if (isEdit && id) {
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

  return { onSubmit, navigate, isPending: create.isPending || update.isPending };
}
