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

export function CfdiFieldsCard() {
  const { control, setValue } = useFormContext<InvoiceFormValues>();
  const moneda = useWatch({ control, name: "cfdi.moneda" });
  const receptor = useWatch({ control, name: "cfdi" });
  const [receptorOpen, setReceptorOpen] = useState(false);

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
