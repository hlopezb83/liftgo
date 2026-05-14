import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { CLAVE_PROD_SERV, CLAVE_UNIDAD } from "@/lib/satCatalogs";
import type { LineItem } from "@/features/invoices/lib/invoiceUtils";

export interface CfdiLineItem extends LineItem {
  clave_prod_serv?: string;
  clave_unidad?: string;
  objeto_imp?: string;
}

interface EditableLineItemsTableProps {
  lineItems: CfdiLineItem[];
  onUpdateItem: (idx: number, field: string, value: string | number) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
}

export function EditableLineItemsTable({ lineItems, onUpdateItem, onAddItem, onRemoveItem }: EditableLineItemsTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Partidas</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={onAddItem}>
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
            {lineItems.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Input value={item.description} onChange={(e) => onUpdateItem(idx, "description", e.target.value)} className="h-8" />
                </TableCell>
                <TableCell>
                  <Select value={item.clave_prod_serv || ""} onValueChange={(v) => onUpdateItem(idx, "clave_prod_serv", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Código" /></SelectTrigger>
                    <SelectContent>
                      {CLAVE_PROD_SERV.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={item.clave_unidad || ""} onValueChange={(v) => onUpdateItem(idx, "clave_unidad", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unidad" /></SelectTrigger>
                    <SelectContent>
                      {CLAVE_UNIDAD.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => onUpdateItem(idx, "quantity", Number(e.target.value))} className="h-8" />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" min={0} value={item.unit_price} onChange={(e) => onUpdateItem(idx, "unit_price", Number(e.target.value))} className="h-8" />
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(item.total)}</TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {lineItems.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin partidas aún</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
