import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

export function ReceptorFiscalFields() {
  const { control } = useFormContext<InvoiceFormValues>();
  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-muted-foreground">
        Estos datos se heredan del cliente. Edítalos solo si la Constancia de Situación Fiscal del receptor difiere.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <FormField control={control} name="cfdi.receptorRfc" render={({ field }) => (
          <FormItem>
            <FormLabel>RFC Receptor</FormLabel>
            <FormControl>
              <Input placeholder="XAXX010101000" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="cfdi.receptorRazonSocial" render={({ field }) => (
          <FormItem><FormLabel>Razón Social</FormLabel><FormControl><Input placeholder="Nombre legal del receptor" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="cfdi.receptorRegimenFiscal" render={({ field }) => (
          <FormItem><FormLabel>Régimen Fiscal Receptor</FormLabel><FormControl><Input placeholder="601" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="cfdi.receptorDomicilioFiscalCp" render={({ field }) => (
          <FormItem><FormLabel>C.P. Fiscal Receptor</FormLabel><FormControl><Input placeholder="06600" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </div>
  );
}
