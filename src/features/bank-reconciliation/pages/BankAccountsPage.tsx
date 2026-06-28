import { useState } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useBankAccounts, useDeleteBankAccount, type BankAccount } from "../hooks/useBankAccounts";
import { BankAccountFormDialog } from "../components/BankAccountFormDialog";

export default function BankAccountsPage() {
  const { data: accounts, isLoading } = useBankAccounts();
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [open, setOpen] = useState(false);
  const del = useDeleteBankAccount();

  const handleNew = () => { setEditing(null); setOpen(true); };
  const handleEdit = (a: BankAccount) => { setEditing(a); setOpen(true); };

  return (
    <RoleGuard module="Facturas de Proveedor" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Cuentas bancarias"
            subtitle="Catálogo de cuentas para conciliación bancaria"
            action={<Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" /> Nueva cuenta</Button>}
          />
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
                ) : (accounts ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin cuentas. Crea la primera para comenzar.</td></tr>
                ) : (accounts ?? []).map((a, i) => (
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
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm(`¿Eliminar "${a.name}"?`)) del.mutate(a.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
          <BankAccountFormDialog open={open} onOpenChange={setOpen} initial={editing} />
        </div>
      </PageTransition>
    </RoleGuard>
  );
}
