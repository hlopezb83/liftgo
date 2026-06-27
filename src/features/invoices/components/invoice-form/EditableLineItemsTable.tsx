import { useFormContext, useWatch } from "react-hook-form";
import { lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Plus, Trash2 } from "lucide-react";
import { useInvoiceLineItemHandlers } from "../../hooks/invoiceForm/useInvoiceLineItemHandlers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { CLAVE_PROD_SERV, CLAVE_UNIDAD } from "@/lib/domain/satCatalogs";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

export function EditableLineItemsTable() {
  const form = useFormContext<InvoiceFormValues>();
  const { fields, addLineItem, removeLineItem } = useInvoiceLineItemHandlers(form);
  const rootError = form.formState.errors.lineItems?.message;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Partidas</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-3 w-3 mr-1" />Agregar Fila
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-28">ClaveProdServ</TableHead>
              <TableHead className="w-20">ClaveUnidad</TableHead>
              <TableHead className="w-20">Cant.</TableHead>
              <TableHead className="w-28">Precio Unit.</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((row, idx) => (
              <LineItemRow key={row.id} index={idx} onRemove={removeLineItem} />
            ))}
            {fields.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin partidas aún</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {rootError && (
          <p className="text-sm text-destructive px-4 py-2">{rootError}</p>
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
  const [quantity, unitPrice] = useWatch({
    control,
    name: [`lineItems.${index}.quantity`, `lineItems.${index}.unit_price`],
  });
  const total = lineItemTotal(Number(quantity ?? 0), Number(unitPrice ?? 0));

  const syncTotal = (q: number, p: number) => {
    const next = lineItemTotal(q, p);
    const current = getValues(`lineItems.${index}.total`);
    if (current !== next) setValue(`lineItems.${index}.total`, next, { shouldDirty: true });
  };

  return (
    <TableRow>
      <TableCell>
        <FormField control={control} name={`lineItems.${index}.description`} render={({ field }) => (
          <FormItem><FormControl><Input className="h-8" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </TableCell>
      <TableCell>
        <FormField control={control} name={`lineItems.${index}.clave_prod_serv`} render={({ field }) => (
          <FormItem>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Código" /></SelectTrigger></FormControl>
              <SelectContent>
                {CLAVE_PROD_SERV.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      </TableCell>
      <TableCell>
        <FormField control={control} name={`lineItems.${index}.clave_unidad`} render={({ field }) => (
          <FormItem>
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unidad" /></SelectTrigger></FormControl>
              <SelectContent>
                {CLAVE_UNIDAD.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      </TableCell>
      <TableCell>
        <FormField control={control} name={`lineItems.${index}.quantity`} render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input type="number" min={1} className="h-8" value={field.value} onChange={(e) => {
                const v = Number(e.target.value);
                field.onChange(v);
                syncTotal(v, Number(unitPrice ?? 0));
              }} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </TableCell>
      <TableCell>
        <FormField control={control} name={`lineItems.${index}.unit_price`} render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input type="number" step="0.01" min={0} className="h-8" value={field.value} onChange={(e) => {
                const v = Number(e.target.value);
                field.onChange(v);
                syncTotal(Number(quantity ?? 0), v);
              }} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(total)}</TableCell>
      <TableCell>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(index)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
