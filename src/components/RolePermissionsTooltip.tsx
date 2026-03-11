import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";

const ROLE_PERMISSIONS: Record<AppRole, { label: string; access: string[]; readOnly?: string[] }> = {
  admin: {
    label: "Administrador",
    access: ["Acceso total a todos los módulos"],
  },
  administrativo: {
    label: "Administrativo",
    access: ["Facturas", "Pagos", "Contratos", "Entregas", "Configuración", "Gastos", "Proveedores"],
    readOnly: ["Dashboard", "Flota", "Reservas", "Reportes"],
  },
  ventas: {
    label: "Ventas",
    access: ["CRM / Prospectos", "Clientes", "Cotizaciones"],
    readOnly: ["Dashboard", "Calendario", "Flota", "Reservas", "Reportes"],
  },
  dispatcher: {
    label: "Despachador",
    access: ["Reservas", "Entregas", "Calendario"],
    readOnly: ["Dashboard", "Flota", "Clientes"],
  },
  mechanic: {
    label: "Mecánico",
    access: ["Mantenimiento", "Daños", "Refacciones"],
    readOnly: ["Flota"],
  },
  auditor: {
    label: "Auditor",
    access: [],
    readOnly: ["Acceso de solo lectura a todos los módulos"],
  },
  customer: {
    label: "Cliente",
    access: ["Portal de Clientes"],
  },
};

export { ROLE_PERMISSIONS };

export function RolePermissionsTooltip({ role }: { role: AppRole }) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" className="max-w-xs p-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold mb-1">{perms.label}</p>
        {perms.access.length > 0 && (
          <div className="mb-1">
            <span className="text-xs font-medium text-emerald-500">Acceso completo:</span>
            <p className="text-xs">{perms.access.join(", ")}</p>
          </div>
        )}
        {perms.readOnly && perms.readOnly.length > 0 && (
          <div>
            <span className="text-xs font-medium text-blue-500">Solo lectura:</span>
            <p className="text-xs">{perms.readOnly.join(", ")}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
