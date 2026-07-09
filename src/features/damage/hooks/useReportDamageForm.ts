import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { notifySuccess } from "@/lib/ui/appFeedback";

import { useCreateDamageRecord } from "./useDamageRecords";
import { useUploadDocument } from "@/hooks/useDocuments";

export interface DamagePreview { file: File; url: string }

export const reportDamageSchema = z.object({
  forkliftId: z.string().min(1, "Selecciona un montacargas"),
  customerId: z.string().default(""),
  description: z.string().trim().min(1, "Describe el daño"),
  estimatedCost: z.number().min(0).nullable().default(null),
});

export type ReportDamageValues = z.infer<typeof reportDamageSchema>;

const DEFAULTS: ReportDamageValues = {
  forkliftId: "",
  customerId: "",
  description: "",
  estimatedCost: null,
};

export function useReportDamageForm(onClose: () => void) {
  const form = useForm<ReportDamageValues>({
    resolver: zodResolver(reportDamageSchema),
    defaultValues: DEFAULTS,
  });
  const [previews, setPreviews] = useState<DamagePreview[]>([]);

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

  const reset = useCallback(() => {
    setPreviews((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
    form.reset(DEFAULTS);
  }, [form]);

  useEffect(() => () => {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const newRecord = await createDamage.mutateAsync({
        forklift_id: values.forkliftId,
        customer_id: values.customerId || null,
        description: values.description,
        estimated_cost: values.estimatedCost ?? 0,
        status: "reported",
      });

      if (previews.length > 0) {
        await Promise.all(
          previews.map(({ file }) =>
            uploadDoc.mutateAsync({ file, entityType: "damage_record", entityId: newRecord.id }),
          ),
        );
      }

      notifySuccess("Daño reportado", {
        description: previews.length > 0
          ? `Registro creado con ${previews.length} foto(s).`
          : "El registro de daño se creó correctamente.",
      });
      reset();
      onClose();
    } catch {
      // silent: errors handled by mutation hooks
    }
  });

  return {
    form,
    previews, onDrop, removePreview, reset,
    handleSubmit,
    isProcessing: form.formState.isSubmitting || createDamage.isPending,
  };
}
