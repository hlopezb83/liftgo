import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyField, DateField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { TrophyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { positiveAmount } from "@/lib/schemas";
import { nowMty, formatDateDisplay } from "@/lib/utils";
import type { Prospect } from "../hooks/useProspects";

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { final_amount: number; closed_at: string; notes: string | null }) => void;
  isPending?: boolean;
}

const schema = z.object({
  finalAmount: positiveAmount("Debe ser mayor a 0"),
  closedAt: z.date({ error: "Requerido" }),
  extraNote: z.string().default(""),
});

type FormValues = z.infer<typeof schema>;

export function CloseWonDialog({ prospect, open, onOpenChange, onConfirm, isPending }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { finalAmount: 0, closedAt: nowMty(), extraNote: "" },
  });

  useEffect(() => {
    if (open && prospect) {
      form.reset({
        finalAmount: Number(prospect.dealValue ?? 0),
        closedAt: nowMty(),
        extraNote: "",
      });
    }
  }, [open, prospect, form]);

  if (!prospect) return null;

  const handleSubmit = form.handleSubmit((values) => {
    const ymd = toYMD(values.closedAt);
    const baseNotes = prospect.notes ? `${prospect.notes}\n\n` : "";
    const trimmedNote = values.extraNote.trim();
    const closingNote = trimmedNote ? `[Cierre Ganado ${formatDateDisplay(ymd)}] ${trimmedNote}` : null;
    onConfirm({
      final_amount: values.finalAmount,
      closed_at: values.closedAt.toISOString(),
      notes: closingNote ? `${baseNotes}${closingNote}` : prospect.notes,
    });
  });

  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title="Marcar como Ganado"
      description={
        <>
          Cerrar deal con <span className="font-medium">{prospect.companyName}</span>. Se moverá fuera del pipeline activo.
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <CurrencyField
            control={form.control}
            name="finalAmount"
            label="Monto final cerrado"
            currency="MXN"
            required
          />
          <DateField control={form.control} name="closedAt" label="Fecha de cierre" required />
          <TextareaField
            control={form.control}
            name="extraNote"
            label="Nota (opcional)"
            rows={3}
            placeholder="Detalles del cierre, contrato firmado, etc."
          />

          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              <TrophyIcon className="h-4 w-4 mr-1" />
              Confirmar Ganado
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
