import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Landmark, Star } from "lucide-react";
import { RoleGuard } from "@/layouts/RoleGuard";
import {
  useSupplierBankAccounts,
  useDeleteSupplierBankAccount,
  maskClabe,
  type SupplierBankAccount,
} from "@/features/suppliers/hooks/useSupplierBankAccounts";
import { SupplierBankAccountFormDialog } from "./SupplierBankAccountFormDialog";

export function SupplierBankAccountsSection({ supplierId }: { supplierId: string }) {
  const { data: accounts = [], isLoading } = useSupplierBankAccounts(supplierId);
  const del = useDeleteSupplierBankAccount();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierBankAccount | null>(null);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEdit = (a: SupplierBankAccount) => { setEditing(a); setOpen(true); };
  const onDelete = (a: SupplierBankAccount) => {
    if (confirm(`¿Eliminar la cuenta de "${a.bank_name}"?`)) {
      del.mutate({ id: a.id, supplier_id: supplierId });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Cuentas Bancarias <span className="text-muted-foreground font-normal">({accounts.length})</span>
        </CardTitle>
        <RoleGuard module="Proveedores" minAccess="full">
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />Agregar
          </Button>
        </RoleGuard>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Sin cuentas bancarias registradas.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Banco</TableHead>
                <TableHead>Titular</TableHead>
                <TableHead className="font-mono">CLABE</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} className="odd:bg-muted/30">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {a.bank_name}
                      {a.is_primary && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" />Primaria
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{a.account_holder}</TableCell>
                  <TableCell className="font-mono text-sm">{maskClabe(a.clabe)}</TableCell>
                  <TableCell className="text-sm">{a.currency}</TableCell>
                  <TableCell className="text-right">
                    <RoleGuard module="Proveedores" minAccess="full">
                      <Button size="icon" variant="ghost" onClick={() => onEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(a)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </RoleGuard>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <SupplierBankAccountFormDialog
        open={open}
        onOpenChange={setOpen}
        supplierId={supplierId}
        account={editing}
      />
    </Card>
  );
}
