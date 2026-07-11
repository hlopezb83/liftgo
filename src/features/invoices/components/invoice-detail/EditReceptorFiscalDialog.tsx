import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { z } from "zod";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/components/forms/fields";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdateReceptorFiscalInfo } from "../../hooks/invoiceDetail/useReceptorTaxInfo";
import type { Tables } from "@/integrations/supabase/types";

const schema = z.object({
  razonSocial: z.string().trim().min(1, "Requerido").max(254),
  regimen: z.string().min(1, "Requerido"),
  cp: z.string().regex(/^\d{5}$/, "CP debe tener 5 dígitos"),
  syncCustomer: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices">;
}

export function EditReceptorFiscalDialog({ open, onOpenChange, invoice }: Props) {
  const update = useUpdateReceptorFiscalInfo();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      razonSocial: "",
      regimen: "",
      cp: "",
      syncCustomer: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        razonSocial: invoice.receptor_razon_social ?? invoice.customer_name ?? "",
        regimen: invoice.receptor_regimen_fiscal ?? "",
        cp: invoice.receptor_domicilio_fiscal_cp ?? "",
        syncCustomer: true,
      });
    }
  }, [open, invoice, form]);

  const onSubmit = (values: FormValues) => {
    update.mutate(
      {
        invoiceId: invoice.id,
        customerId: invoice.customer_id ?? null,
        syncCustomer: values.syncCustomer,
        patch: {
          receptor_razon_social: values.razonSocial.trim().toUpperCase(),
          receptor_regimen_fiscal: values.regimen,
          receptor_domicilio_fiscal_cp: values.cp.trim(),
        },
      },
      {
        onSuccess: () => {
          notifySuccess("Datos fiscales del receptor actualizados");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar datos fiscales del receptor"
      width="lg"
      description={
        <>
          Estos valores se enviarán al PAC al timbrar CFDIs y notas de crédito de esta factura.
          Deben coincidir <strong>exactamente</strong> con la Constancia de Situación Fiscal del cliente.
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input value={invoice.receptor_rfc ?? ""} disabled className="font-mono" />
            <p className="text-xs text-muted-foreground">
              El RFC no se edita aquí; modifícalo desde la ficha del cliente.
            </p>
          </div>

          <TextField
            control={form.control}
            name="razonSocial"
            label="Razón social"
            required
            placeholder="EJ: LOGISTORAGE"
            description="Mayúsculas, sin acentos, sin régimen societario (S.A. de C.V.)."
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              control={form.control}
              name="regimen"
              label="Régimen fiscal"
              required
              options={REGIMEN_FISCAL.map((r) => ({ value: r.code, label: r.label }))}
            />
            <TextField
              control={form.control}
              name="cp"
              label="CP fiscal"
              required
              placeholder="64000"
            />
          </div>

          {invoice.customer_id && (
            <div className="rounded-md border p-3 bg-muted/30">
              <CheckboxField
                control={form.control}
                name="syncCustomer"
                label="Actualizar también estos datos en la ficha del cliente para futuras facturas."
              />
            </div>
          )}

          <FormDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
