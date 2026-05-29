import { useCallback, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";
import { useCreateDamageRecord } from "@/features/damage/hooks/useDamageRecords";
import { useUploadDocument } from "@/hooks/useDocuments";

export interface DamagePreview { file: File; url: string }

export function useReportDamageForm(onClose: () => void) {
  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [previews, setPreviews] = useState<DamagePreview[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const createDamage = useCreateDamageRecord();
  const uploadDoc = useUploadDocument();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPreviews = acceptedFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, 10));
  }, []);

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const reset = () => {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setForkliftId("");
    setCustomerId("");
    setDescription("");
    setEstimatedCost("");
    setPreviews([]);
  };

  const handleSubmit = async () => {
    if (!forkliftId || !description.trim()) {
      notifyError({ title: "Campos requeridos", description: "Selecciona un montacargas y describe el daño." });
      return;
    }
    setSubmitting(true);
    try {
      const newRecord = await createDamage.mutateAsync({
        forklift_id: forkliftId,
        customer_id: customerId || null,
        description: description.trim(),
        estimated_cost: estimatedCost ? Number(estimatedCost) : 0,
        status: "reported",
      });

      if (previews.length > 0) {
        await Promise.all(
          previews.map(({ file }) =>
            uploadDoc.mutateAsync({ file, entityType: "damage_record", entityId: newRecord.id }),
          ),
        );
      }

      toast.success("Daño reportado", {
        description: previews.length > 0
          ? `Registro creado con ${previews.length} foto(s).`
          : "El registro de daño se creó correctamente.",
      });
      reset();
      onClose();
    } catch {
      // errors handled by mutation hooks
    } finally {
      setSubmitting(false);
    }
  };

  return {
    forkliftId, setForkliftId,
    customerId, setCustomerId,
    description, setDescription,
    estimatedCost, setEstimatedCost,
    previews, onDrop, removePreview, reset,
    handleSubmit,
    isProcessing: submitting || createDamage.isPending,
  };
}
