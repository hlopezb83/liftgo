import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { z } from "zod";
import { ErrorIcon } from "@/components/icons";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { SelectField, TextareaField } from "@/components/forms/fields";
import { nowMty } from "@/lib/utils";
import { LOST_REASONS } from "../lib/constants";
import type { Prospect } from "../hooks/useProspects";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { lost_reason: string; closed_at: string; notes: string | null }) => void;
  isPending?: boolean;
}

const schema = z
  .object({
    reason: z.string().min(1, "Selecciona una razón"),
    extraNote: z.string().default(""),
  })
  .refine((v) => v.reason !== "otro" || v.extraNote.trim().length > 0, {
    message: "Describe la razón cuando eliges 'Otro'",
    path: ["extraNote"],
  });

type FormValues = z.infer<typeof schema>;

export function CloseLostDialog({ prospect, open, onOpenChange, onConfirm, isPending }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", extraNote: "" },
  });

  useEffect(() => {
    if (open) form.reset({ reason: "", extraNote: "" });
  }, [open, form]);

  if (!prospect) return null;

  const reason = form.watch("reason");
  const requiresNote = reason === "otro";

  const handleSubmit = form.handleSubmit((values) => {
    const today = format(nowMty(), "yyyy-MM-dd");
    const baseNotes = prospect.notes ? `${prospect.notes}\n\n` : "";
    const reasonLabel = LOST_REASONS.find((r) => r.value === values.reason)?.label ?? values.reason;
    const trimmedNote = values.extraNote.trim();
    const closingNote = `[Cierre Perdido ${today}] Razón: ${reasonLabel}${trimmedNote ? ` — ${trimmedNote}` : ""}`;
    onConfirm({
      lost_reason: values.reason,
      closed_at: new Date().toISOString(),
      notes: `${baseNotes}${closingNote}`,
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title="Marcar como Perdido"
      description={
        <>
          Cerrar deal con <span className="font-medium">{prospect.companyName}</span>. Saldrá del pipeline activo.
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <SelectField
            control={form.control}
            name="reason"
            label="Razón de pérdida"
            options={LOST_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Selecciona una razón"
            required
          />
          <TextareaField
            control={form.control}
            name="extraNote"
            label="Nota"
            required={requiresNote}
            rows={3}
            placeholder={
              requiresNote
                ? "Describe la razón (obligatorio si seleccionaste Otro)"
                : "Detalles adicionales (opcional)"
            }
          />

          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              <ErrorIcon className="h-4 w-4 mr-1" />
              Confirmar Perdido
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
