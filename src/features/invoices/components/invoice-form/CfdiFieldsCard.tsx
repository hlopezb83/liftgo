import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FORMA_PAGO, METODO_PAGO, USO_CFDI, MONEDA } from "@/lib/domain/satCatalogs";
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

export function CfdiFieldsCard() {
  const { control, setValue } = useFormContext<InvoiceFormValues>();
  const moneda = useWatch({ control, name: "cfdi.moneda" });
  const receptor = useWatch({ control, name: "cfdi" });
  const [receptorOpen, setReceptorOpen] = useState(false);
  const isGlobal = (receptor?.receptorRfc || "").toUpperCase() === "XAXX010101000";


  const receptorSummary = [
    receptor?.receptorRfc || "Sin RFC",
    receptor?.receptorRegimenFiscal ? `Régimen ${receptor.receptorRegimenFiscal}` : null,
    receptor?.receptorDomicilioFiscalCp ? `CP ${receptor.receptorDomicilioFiscalCp}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Datos de timbrado CFDI</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FormField control={control} name="cfdi.formaPago" render={({ field }) => (
            <FormItem>
              <FormLabel>Forma de Pago</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {FORMA_PAGO.map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={control} name="cfdi.metodoPago" render={({ field }) => (
            <FormItem>
              <FormLabel>Método de Pago</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {METODO_PAGO.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={control} name="cfdi.usoCfdi" render={({ field }) => (
            <FormItem>
              <FormLabel>Uso CFDI</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {USO_CFDI.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField control={control} name="cfdi.moneda" render={({ field }) => (
            <FormItem>
              <FormLabel>Moneda</FormLabel>
              <Select value={field.value} onValueChange={(v) => {
                field.onChange(v);
                if (v === "MXN") setValue("cfdi.tipoCambio", 1, { shouldDirty: true });
              }}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {MONEDA.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          {moneda !== "MXN" && (
            <FormField control={control} name="cfdi.tipoCambio" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Cambio</FormLabel>
                <FormControl>
                  <Input type="number" step="0.0001" value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          )}
        </div>

        {isGlobal && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-200 tracking-wider">
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
        )}

        <Collapsible open={receptorOpen} onOpenChange={setReceptorOpen}>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Datos fiscales del receptor
              </span>
              <span className="text-sm text-foreground">{receptorSummary}</span>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="gap-1">
                {receptorOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {receptorOpen ? "Cerrar" : "Editar"}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Estos datos se heredan del cliente. Edítalos solo si la Constancia de Situación Fiscal del receptor difiere.
            </p>
            <div className="grid grid-cols-2 gap-4">
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
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
