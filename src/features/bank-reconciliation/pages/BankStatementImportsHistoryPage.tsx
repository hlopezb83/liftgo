import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowLeft } from "lucide-react";
import { formatDateDisplay } from "@/lib/utils";
import { useUserRole } from "@/features/users";
import { useBankStatementImports, useDeleteBankImport } from "../hooks/useBankStatementImports";

export default function BankStatementImportsHistoryPage() {
  const navigate = useNavigate();
  const { data: imports, isLoading } = useBankStatementImports();
  const { data: role } = useUserRole();
  const del = useDeleteBankImport();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canDelete = role === "admin";

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="Historial de imports bancarios"
          subtitle="Estados de cuenta cargados y porcentaje de conciliación por archivo"
        />
        <Button variant="outline" size="sm" onClick={() => navigate("/conciliacion-bancaria")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha import</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Conciliadas</TableHead>
                <TableHead className="text-right">% Concil.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && (imports ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sin imports registrados</TableCell></TableRow>
              )}
              {(imports ?? []).map((i, idx) => {
                const pct = i.total_count > 0 ? Math.round((i.matched_count / i.total_count) * 100) : 0;
                return (
                  <TableRow key={i.id} className={idx % 2 ? "bg-muted/30" : ""}>
                    <TableCell className="text-xs">{formatDateDisplay(i.created_at)}</TableCell>
                    <TableCell className="text-xs">
                      {i.bank_account_name}
                      {i.bank_account_last4 && <span className="text-muted-foreground"> ····{i.bank_account_last4}</span>}
                    </TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[200px]">{i.file_name}</TableCell>
                    <TableCell className="text-xs">
                      {i.period_start && i.period_end
                        ? `${formatDateDisplay(i.period_start)} → ${formatDateDisplay(i.period_end)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{i.total_count}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{i.matched_count}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={pct === 100 ? "default" : pct >= 50 ? "secondary" : "outline"} className="text-[10px]">
                        {pct}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete && (
                        confirmId === i.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="destructive" className="h-7 text-[11px]"
                              disabled={del.isPending}
                              onClick={() => { del.mutate(i.id, { onSettled: () => setConfirmId(null) }); }}>
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setConfirmId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                            onClick={() => setConfirmId(i.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
