import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUploadDocument } from "@/hooks/useDocuments";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useSaveManualDamageReport } from "./useDamageRecords";

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
  // FIX-R2-07 (03-FIX-13): ref espejo para revocar SOLO al desmontar.
  const previewsRef = useRef<DamagePreview[]>([]);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  const saveDamage = useSaveManualDamageReport();
  const uploadDoc = useUploadDocument();
  // M-18: id del damage_record ya creado en un intento previo cuya subida de
  // fotos falló. Se limpia en `reset()` (éxito completo o cierre del form).
  const savedRecordRef = useRef<{ id: string; updated_at: string } | null>(null);
  const uploadedFilesRef = useRef(new Set<File>());

  const onDrop = (acceptedFiles: File[]) => {
    setPreviews((prev) => {
      // Sólo se crean URLs para las fotos que caben (máx. 10); las excedentes
      // ya no dejan blobs colgados.
      const room = Math.max(10 - prev.length, 0);
      const added = acceptedFiles
        .slice(0, room)
        .map((file) => ({ file, url: URL.createObjectURL(file) }));
      return [...prev, ...added];
    });
  };


  const removePreview = (index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const reset = () => {
    setPreviews((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
    // M-18: al resetear (éxito completo o cierre) se olvida el registro
    // creado — un submit posterior debe crear uno nuevo.
    savedRecordRef.current = null;
    uploadedFilesRef.current.clear();
    form.reset(DEFAULTS);
  };

  // Antes el cleanup corría en CADA cambio de `previews` y revocaba URLs aún
  // en uso (la foto anterior se rompía al añadir otra). removePreview/reset ya
  // revocan puntualmente; aquí solo se limpia lo que quede al desmontar.
  useEffect(() => () => {
    previewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const submitDamage = async (values: ReportDamageValues) => {
    try {
      // M-18: si el registro se creó pero la subida de fotos falló, el
      // reintento guarda las correcciones en el mismo registro antes de
      // continuar únicamente las fotos cuya subida no terminó.
      const saved = await saveDamage.mutateAsync({
        forkliftId: values.forkliftId, customerId: values.customerId,
        description: values.description, estimatedCost: values.estimatedCost ?? 0,
        damageId: savedRecordRef.current?.id,
        expectedUpdatedAt: savedRecordRef.current?.updated_at,
      });
      savedRecordRef.current = { id: saved.id, updated_at: saved.updated_at };

      if (previews.length > 0) {
        const uploads = await Promise.allSettled(
          previews.map(({ file }) =>
            (async () => {
              if (uploadedFilesRef.current.has(file)) return;
              await uploadDoc.mutateAsync({ file, entityType: "damage_record", entityId: saved.id });
              uploadedFilesRef.current.add(file);
            })(),
          ),
        );
        const failure = uploads.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
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
  };

  const handleSubmit = (e?: React.BaseSyntheticEvent) => form.handleSubmit(submitDamage)(e);

  return {
    form,
    previews, onDrop, removePreview, reset,
    handleSubmit,
    isProcessing: form.formState.isSubmitting || saveDamage.isPending || uploadDoc.isPending,
  };
}
