import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

const PERIODICITY_OPTIONS = [
  { code: "01", label: "01 · Diaria" },
  { code: "02", label: "02 · Semanal" },
  { code: "03", label: "03 · Quincenal" },
  { code: "04", label: "04 · Mensual" },
  { code: "05", label: "05 · Bimestral" },
];

const MONTH_OPTIONS = [
  { code: "01", label: "01 · Enero" }, { code: "02", label: "02 · Febrero" },
  { code: "03", label: "03 · Marzo" }, { code: "04", label: "04 · Abril" },
  { code: "05", label: "05 · Mayo" }, { code: "06", label: "06 · Junio" },
  { code: "07", label: "07 · Julio" }, { code: "08", label: "08 · Agosto" },
  { code: "09", label: "09 · Septiembre" }, { code: "10", label: "10 · Octubre" },
  { code: "11", label: "11 · Noviembre" }, { code: "12", label: "12 · Diciembre" },
  { code: "13", label: "13 · Ene-Feb" }, { code: "14", label: "14 · Mar-Abr" },
  { code: "15", label: "15 · May-Jun" }, { code: "16", label: "16 · Jul-Ago" },
  { code: "17", label: "17 · Sep-Oct" }, { code: "18", label: "18 · Nov-Dic" },
];

export function GlobalInvoiceFields() {
  const { control } = useFormContext<InvoiceFormValues>();
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-4 space-y-3">
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase text-warning-foreground/90 tracking-wider">
          Factura Global · Público en General
        </span>
        <span className="text-xs text-muted-foreground">
          El SAT exige el nodo Información Global. Se forzarán UsoCFDI S01, MétodoPago PUE y FormaPago 01.
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField control={control} name="cfdi.globalPeriodicity" render={({ field }) => (
          <FormItem>
            <FormLabel>Periodicidad</FormLabel>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger></FormControl>
              <SelectContent>
                {PERIODICITY_OPTIONS.map((p) => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="cfdi.globalMonths" render={({ field }) => (
          <FormItem>
            <FormLabel>Mes / Bimestre</FormLabel>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger></FormControl>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name="cfdi.globalYear" render={({ field }) => (
          <FormItem>
            <FormLabel>Año</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={2020}
                max={2099}
                placeholder={String(new Date().getFullYear())}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </div>
  );
}
