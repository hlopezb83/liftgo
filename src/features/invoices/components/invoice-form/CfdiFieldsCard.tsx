import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORMA_PAGO, METODO_PAGO, USO_CFDI, MONEDA } from "@/lib/domain/satCatalogs";
import { GlobalInvoiceFields } from "./GlobalInvoiceFields";
import { ReceptorFiscalFields } from "./ReceptorFiscalFields";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

function CfdiCatalogSelects() {
  const { control } = useFormContext<InvoiceFormValues>();
  return (
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
  );
}

function CurrencyFields() {
  const { control, setValue } = useFormContext<InvoiceFormValues>();
  const moneda = useWatch({ control, name: "cfdi.moneda" });
  return (
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
  );
}

function ReceptorSummaryHeader({
  summary, open, onToggle,
}: { summary: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between border-t pt-3">
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
          Datos fiscales del receptor
        </span>
        <span className="text-sm text-foreground">{summary}</span>
      </div>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onToggle}>
          {open ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          {open ? "Cerrar" : "Editar"}
        </Button>
      </CollapsibleTrigger>
    </div>
  );
}

export function CfdiFieldsCard() {
  const { control } = useFormContext<InvoiceFormValues>();
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
        <CfdiCatalogSelects />
        <CurrencyFields />
        {isGlobal && <GlobalInvoiceFields />}
        <Collapsible open={receptorOpen} onOpenChange={setReceptorOpen}>
          <ReceptorSummaryHeader summary={receptorSummary} open={receptorOpen} onToggle={() => setReceptorOpen((v) => !v)} />
          <CollapsibleContent>
            <ReceptorFiscalFields />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
