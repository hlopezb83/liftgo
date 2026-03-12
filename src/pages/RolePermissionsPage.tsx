import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Eye, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { ROLE_PERMISSIONS } from "@/components/RolePermissionsTooltip";
import type { AppRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

const MODULES = [
  "Dashboard",
  "Flota",
  "Reservas",
  "Calendario",
  "Entregas",
  "Facturas",
  "Pagos",
  "Contratos",
  "Cotizaciones",
  "Clientes",
  "CRM / Prospectos",
  "Mantenimiento",
  "Daños",
  "Refacciones",
  "Gastos",
  "Proveedores",
  "Reportes",
  "Configuración",
  "Gestión de Usuarios",
];

function getAccess(role: AppRole, module: string): "full" | "read" | "none" {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return "none";
  if (role === "admin") return "full";
  if (role === "auditor") return "read";
  if (module === "Gestión de Usuarios") return "none";
  if (perms.access.some((a) => module.includes(a) || a.includes(module))) return "full";
  if (perms.readOnly?.some((a) => module.includes(a) || a.includes(module))) return "read";
  return "none";
}

const accessConfig = {
  full: { icon: Check, color: "text-emerald-500", label: "Acceso completo" },
  read: { icon: Eye, color: "text-blue-500", label: "Solo lectura" },
  none: { icon: Minus, color: "text-muted-foreground/40", label: "Sin acceso" },
};

export default function RolePermissionsPage() {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Permisos por Rol"
          subtitle="Consulta los niveles de acceso de cada rol del sistema por módulo"
          action={
            <Button variant="outline" onClick={() => navigate("/users")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Usuarios
            </Button>
          }
        />

        <div className="rounded-lg border bg-card overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3 font-semibold min-w-[160px]">Módulo</th>
                {STAFF_ROLES.map((r) => (
                  <th key={r} className="px-3 py-3 text-center min-w-[100px]">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", ROLE_COLORS[r])}>
                      {ROLE_LABELS[r]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, i) => (
                <tr key={mod} className={cn("border-t", i % 2 === 0 && "bg-muted/20")}>
                  <td className="px-4 py-2.5 font-medium">{mod}</td>
                  {STAFF_ROLES.map((r) => {
                    const access = getAccess(r, mod);
                    const { icon: Icon, color } = accessConfig[access];
                    return (
                      <td key={r} className="px-3 py-2.5 text-center">
                        <Icon className={cn("h-4 w-4 mx-auto", color)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-5 text-xs text-muted-foreground">
          {Object.values(accessConfig).map(({ icon: Icon, color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon className={cn("h-3.5 w-3.5", color)} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
