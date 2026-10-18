import { AddIcon, ChartIcon, ChevronDownIcon, FileClock, FileSpreadsheet, KeyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Link } from "@/lib/router-compat-ui";

interface AccountsPayableActionsProps {
  releasableLocks: number;
  isReleasing: boolean;
  canManageBatches: boolean;
  onCreate: () => void;
  onExport: () => void;
  onBatches: () => void;
  onRelease: () => void;
}

export function AccountsPayableActions({ releasableLocks, isReleasing, canManageBatches, onCreate, onExport, onBatches, onRelease }: AccountsPayableActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
        <Button onClick={onCreate}><AddIcon className="mr-1 h-4 w-4" />Nueva factura</Button>
      </RoleGuard>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Más acciones<ChevronDownIcon className="ml-1 h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/cuentas-por-pagar/antiguedad"><ChartIcon className="mr-2 h-4 w-4" />Antigüedad</Link>
          </DropdownMenuItem>
          {canManageBatches && <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
            <DropdownMenuItem onSelect={onExport}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar pagos</DropdownMenuItem>
            <DropdownMenuItem onSelect={onBatches}><FileClock className="mr-2 h-4 w-4" />Historial de lotes</DropdownMenuItem>
          </RoleGuard>}
          <RoleGuard module="Facturas de Proveedor" minAccess="full" fallback={null}>
            {releasableLocks > 0 && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onRelease} disabled={isReleasing} aria-label="Liberar bloqueos de pago">
                <KeyIcon className="mr-2 h-4 w-4" />Liberar bloqueos ({releasableLocks})
              </DropdownMenuItem>
            </>}
          </RoleGuard>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}