import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
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
              <Input
                placeholder="XAXX010101000"
                maxLength={13}
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
                {...field}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="cfdi.receptorRazonSocial" render={({ field }) => (
          <FormItem><FormLabel>Razón Social</FormLabel><FormControl><Input placeholder="Nombre legal del receptor" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={control} name="cfdi.receptorRegimenFiscal" render={({ field }) => {
          const currentValue = field.value?.trim() ?? "";
          const hasCatalogMatch = REGIMEN_FISCAL.some((r) => r.code === currentValue);
          return (
            <FormItem>
              <FormLabel>Régimen Fiscal Receptor</FormLabel>
              <Select
                value={field.value ?? ""}
                onValueChange={(value) => {
                  // Radix can emit an empty native-select value while reset hydrates its options.
                  if (value) field.onChange(value);
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar régimen fiscal" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {currentValue && !hasCatalogMatch && (
                    <SelectItem value={currentValue}>{currentValue} — Valor actual</SelectItem>
                  )}
                  {REGIMEN_FISCAL.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          );
        }} />
        <FormField control={control} name="cfdi.receptorDomicilioFiscalCp" render={({ field }) => (
          <FormItem><FormLabel>C.P. Fiscal Receptor</FormLabel><FormControl><Input placeholder="06600" inputMode="numeric" maxLength={5} className="font-mono" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </div>
  );
}
