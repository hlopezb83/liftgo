import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCreateForklift, useUpdateForklift, useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { forkliftFormSchema, type ForkliftFormData } from "@/lib/formSchemas";
import {
  buildForkliftPayload,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "@/lib/forms/forkliftPayload";

interface Args {
  id?: string;
  isEdit: boolean;
  form: ForkliftFormData;
}

export function useForkliftFormSubmit({ id, isEdit, form }: Args) {
  const navigate = useNavigate();
  const create = useCreateForklift();
  const update = useUpdateForklift();
  const { data: allForklifts } = useForklifts();

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

  return { handleSubmit, navigate, isPending: create.isPending || update.isPending };
}
