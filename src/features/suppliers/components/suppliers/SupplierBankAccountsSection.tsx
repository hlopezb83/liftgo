import { useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { AddIcon, EditIcon, DeleteIcon, BankIcon, StarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RoleGuard } from "@/layouts/RoleGuard";
import {
  useSupplierBankAccounts,
  useDeleteSupplierBankAccount,
  maskClabe,
  type SupplierBankAccount,
} from "../../hooks/useSupplierBankAccounts";
import { SupplierBankAccountFormDialog } from "./SupplierBankAccountFormDialog";

export function SupplierBankAccountsSection({ supplierId }: { supplierId: string }) {
  const { data: accounts = [], isLoading } = useSupplierBankAccounts(supplierId);
  const del = useDeleteSupplierBankAccount();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierBankAccount | null>(null);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEdit = (a: SupplierBankAccount) => { setEditing(a); setOpen(true); };
  const onDelete = async (a: SupplierBankAccount) => {
    const ok = await confirm({
      title: "Eliminar cuenta bancaria",
      description: `¿Eliminar la cuenta de "${a.bank_name}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) del.mutate({ id: a.id, supplier_id: supplierId });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <BankIcon className="h-4 w-4" />
          Cuentas Bancarias <span className="text-muted-foreground font-normal">({accounts.length})</span>
        </CardTitle>
        <RoleGuard module="Proveedores" minAccess="full">
          <Button size="sm" variant="outline" onClick={onAdd}>
            <AddIcon className="h-4 w-4 mr-1" />Agregar
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
                          <StarIcon className="h-3 w-3" />Primaria
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
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(a)}>
                        <DeleteIcon className="h-4 w-4" />
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
