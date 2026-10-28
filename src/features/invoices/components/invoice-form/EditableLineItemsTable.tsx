import { useFormContext, useWatch } from "react-hook-form";
import { AddIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { CLAVE_PROD_SERV, CLAVE_UNIDAD } from "@/lib/domain/satCatalogs";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { useInvoiceLineItemHandlers } from "../../hooks/invoiceForm/useInvoiceLineItemHandlers";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

export function EditableLineItemsTable() {
  const form = useFormContext<InvoiceFormValues>();
  const { fields, addLineItem, removeLineItem } = useInvoiceLineItemHandlers(form);
  // R15 F-02: Zod superRefine con path: ["lineItems"] emite en .root.message
  // (RHF 7.x). Preferimos root, con fallback a .message por compatibilidad.
  const rootError =
    form.formState.errors.lineItems?.root?.message ??
    form.formState.errors.lineItems?.message;

  return (
    <Card role="region" aria-labelledby="invoice-line-items-heading" className="min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle id="invoice-line-items-heading" className="text-base">Partidas</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
            <AddIcon className="h-3 w-3 mr-1" />Agregar Fila
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">El importe neto incluye el descuento, antes de IVA.</p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <ol aria-label="Partidas de la factura" className="space-y-4">
          {fields.map((row, idx) => (
            <li key={row.id}><LineItemRow index={idx} onRemove={removeLineItem} /></li>
          ))}
        </ol>
        {fields.length === 0 && <p className="py-6 text-center text-muted-foreground">Sin partidas aún</p>}
        {rootError && (
          <p role="alert" className="text-sm text-destructive">{rootError}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  index: number;
  onRemove: (idx: number) => void;
}

function LineItemRow({ index, onRemove }: RowProps) {
  const { control, setValue, getValues } = useFormContext<InvoiceFormValues>();
  const currency = useWatch({ control, name: "cfdi.moneda" });
  const origin = useWatch({ control, name: `lineItems.${index}.source_quote_line_id` });
  const [quantity, unitPrice, discount, discountType] = useWatch({
    control,
    name: [`lineItems.${index}.quantity`, `lineItems.${index}.unit_price`,
      `lineItems.${index}.discount`, `lineItems.${index}.discount_type`],
  });
  const gross = lineItemTotal(Number(quantity ?? 0), Number(unitPrice ?? 0));
  const net = applyDiscountToBase(gross, discount, discountType);
  const discountLabel = discount && discount > 0
    ? (discountType === "$" ? `-${formatCurrencyWithCode(discount, currency)}` : `-${discount}%`) : "Sin descuento";

  const syncTotal = (q: number, p: number) => {
    const next = lineItemTotal(q, p);
    const current = getValues(`lineItems.${index}.total`);
    if (current !== next) setValue(`lineItems.${index}.total`, next, { shouldDirty: true });
  };

  return (
    <fieldset className="min-w-0 space-y-4 rounded-lg border bg-background p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">Partida {index + 1}</legend>
      <div>
        <FormField control={control} name={`lineItems.${index}.description`} render={({ field }) => (
          <FormItem>
            <FormLabel>Descripción</FormLabel>
            <FormControl><Textarea rows={2} className="min-h-[4.5rem] resize-y text-sm" aria-label={`Descripción partida ${index + 1}`} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {origin && <p className="text-xs text-muted-foreground mt-1">Cargo vinculado a cotización</p>}
      </div>
      <div className="grid min-w-0 grid-cols-2 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <FormField control={control} name={`lineItems.${index}.quantity`} render={({ field }) => (
          <FormItem className="min-w-0">
            <FormLabel>Cantidad</FormLabel>
            <FormControl>
              <Input type="number" min={0.000001} step="any" aria-label={`Cantidad partida ${index + 1}`} value={field.value} onChange={(e) => {
                const v = Number(e.target.value);
                field.onChange(v);
                syncTotal(v, Number(unitPrice ?? 0));
              }} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={control} name={`lineItems.${index}.unit_price`} render={({ field }) => (
          <FormItem className="min-w-0">
            <FormLabel>Precio unitario</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" min={0} disabled={!!origin} title={origin ? "Precio pactado en la cotización" : undefined} aria-label={`Precio unitario partida ${index + 1}`} value={field.value} onChange={(e) => {
                const v = Number(e.target.value);
                field.onChange(v);
                syncTotal(Number(quantity ?? 0), v);
              }} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="col-span-2 min-w-0 rounded-md bg-muted/40 px-3 py-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Importe neto</p>
          <output className="block break-words font-mono font-semibold" aria-label={`Importe neto partida ${index + 1}`}>{formatCurrencyWithCode(net, currency)}</output>
          <p className="mt-1 text-xs text-muted-foreground"><span>Descuento: </span>{discountLabel}</p>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
        <FormField control={control} name={`lineItems.${index}.clave_prod_serv`} render={({ field }) => (
          <SatCatalogField label="Clave SAT" index={index} value={field.value} onChange={field.onChange} catalog={CLAVE_PROD_SERV} placeholder="Código" />
        )} />
        <FormField control={control} name={`lineItems.${index}.clave_unidad`} render={({ field }) => (
          <SatCatalogField label="Unidad SAT" index={index} value={field.value} onChange={field.onChange} catalog={CLAVE_UNIDAD} placeholder="Unidad" />
        )} />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="text-destructive" aria-label="Eliminar partida" title={`Eliminar partida ${index + 1}`} onClick={() => onRemove(index)}>
          <DeleteIcon className="mr-1 h-3.5 w-3.5" />Eliminar
        </Button>
      </div>
    </fieldset>
  );
}

function SatCatalogField({ label, index, value, onChange, catalog, placeholder }: {
  label: string;
  index: number;
  value: string | undefined;
  onChange: (value: string) => void;
  catalog: readonly { code: string; label: string }[];
  placeholder: string;
}) {
  const knownValue = catalog.some((entry) => entry.code === value);
  return (
    <FormItem className="min-w-0">
      <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
      <Select value={value || ""} onValueChange={onChange}>
        <FormControl>
          <SelectTrigger aria-label={`${label} partida ${index + 1}`} className="h-auto min-h-10 gap-2 text-xs [&>span]:line-clamp-none [&>span]:break-words [&>span]:whitespace-normal [&>span]:text-left">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="max-w-[calc(100vw-2rem)]">
          {value && !knownValue && <SelectItem value={value}>{value} (fuera del catálogo habitual)</SelectItem>}
          {catalog.map((entry) => <SelectItem key={entry.code} value={entry.code}>{entry.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  );
}
