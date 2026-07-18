import { useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { AddIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { BankAccountFormDialog } from "../components/BankAccountFormDialog";
import { useBankAccounts, useDeleteBankAccount, type BankAccount } from "../hooks/useBankAccounts";

export default function BankAccountsPage() {
  const { data: accounts, isLoading } = useBankAccounts();
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [open, setOpen] = useState(false);
  const del = useDeleteBankAccount();
  const confirm = useConfirm();
  const isTabletOrBelow = useIsTabletOrBelow();

  const handleNew = () => { setEditing(null); setOpen(true); };
  const handleEdit = (a: BankAccount) => { setEditing(a); setOpen(true); };
  const handleDelete = async (a: BankAccount) => {
    const ok = await confirm({
      title: "Eliminar cuenta bancaria",
      description: `¿Eliminar "${a.name}"? Los movimientos conciliados quedarán huérfanos.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) del.mutate(a.id);
  };

  const rows = accounts ?? [];

  return (
    <RoleGuard module="Facturas de Proveedor" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Cuentas bancarias"
            subtitle="Catálogo de cuentas para conciliación bancaria"
            action={<Button onClick={handleNew}><AddIcon className="h-4 w-4 mr-2" /> Nueva cuenta</Button>}
          />
          {isTabletOrBelow ? (
            isLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando…</CardContent></Card>
            ) : (
              <MobileCardList
                items={rows}
                keyExtractor={(a) => a.id}
                emptyMessage="Sin cuentas. Crea la primera para comenzar."
                renderCard={(a) => (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.bank} · {a.currency}</div>
                        </div>
                        <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Activa" : "Inactiva"}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs text-muted-foreground">•••• {a.last4 ?? "—"}</span>
                        <span className="font-mono tabular-nums font-medium">{formatCurrency(a.initial_balance)}</span>
                      </div>
                      <div className="flex justify-end gap-1 pt-1 border-t">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}><EditIcon className="h-3.5 w-3.5 mr-1" />Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}><DeleteIcon className="h-3.5 w-3.5 mr-1" />Eliminar</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            )
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Nombre</th>
                    <th className="text-left px-3 py-2">Banco</th>
                    <th className="text-left px-3 py-2">•••• 4 últimos</th>
                    <th className="text-left px-3 py-2">Moneda</th>
                    <th className="text-right px-3 py-2">Saldo inicial</th>
                    <th className="text-left px-3 py-2">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin cuentas. Crea la primera para comenzar.</td></tr>
                  ) : rows.map((a, i) => (
                    <tr key={a.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                      <td className="px-3 py-2 font-medium">{a.name}</td>
                      <td className="px-3 py-2">{a.bank}</td>
                      <td className="px-3 py-2 font-mono">{a.last4 ?? "—"}</td>
                      <td className="px-3 py-2">{a.currency}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(a.initial_balance)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Activa" : "Inactiva"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}><EditIcon className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}><DeleteIcon className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
          <BankAccountFormDialog open={open} onOpenChange={setOpen} initial={editing} />
        </PageContainer>
      </PageTransition>
    </RoleGuard>
  );
}
