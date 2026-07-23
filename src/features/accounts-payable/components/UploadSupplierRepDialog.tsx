import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { UploadIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useUploadSupplierRep } from "../hooks/useSupplierRepMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  billId: string;
  paymentAmountLabel: string;
}

const schema = z.object({
  xml: z
    .custom<File | null>((v) => v instanceof File, { message: "El XML del REP es obligatorio" }),
  pdf: z
    .custom<File | null>((v) => v === null || v instanceof File, { message: "Archivo inválido" })
    .nullable()
    .default(null),
});
type FormValues = z.input<typeof schema>;

export function UploadSupplierRepDialog({
  open, onOpenChange, paymentId, billId, paymentAmountLabel,
}: Props) {
  const upload = useUploadSupplierRep();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { xml: null, pdf: null },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) form.reset({ xml: null, pdf: null });
  }, [open, form]);

  const onSubmit = form.handleSubmit((values) => {
    if (!(values.xml instanceof File)) return;
    upload.mutate(
      { paymentId, xmlFile: values.xml, pdfFile: values.pdf ?? null, billId },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  const handleOpenChange = (o: boolean) => {
    if (!upload.isPending) onOpenChange(o);
  };

  return (
    <FormDialog
      isPending={upload.isPending}
      open={open}
      onOpenChange={handleOpenChange}
      title="Cargar Complemento de Pago"
      description={`Carga el XML del REP que envió el proveedor por el pago de ${paymentAmountLabel}. Se valida tipo P, RFC del emisor, UUID de la factura y monto.`}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="xml"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  XML del REP<RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept=".xml,application/xml,text/xml"
                    onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pdf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PDF del REP (opcional)</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || upload.isPending}>
              {upload.isPending ? (
                <><SpinnerIcon className="h-4 w-4 mr-1 animate-spin" /> Validando…</>
              ) : (
                <><UploadIcon className="h-4 w-4 mr-1" /> Cargar y validar</>
              )}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
