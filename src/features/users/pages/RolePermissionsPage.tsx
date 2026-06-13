import { PageTransition } from "@/components/layout/PageTransition";
import { notifyError } from "@/lib/ui/appFeedback";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Eye, Minus, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useRolePermissions, useUpdatePermission, MODULES, type AccessLevel } from "@/features/users/hooks/useRolePermissions";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import type { AppRole } from "@/features/users/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const accessConfig = {
  full: { icon: Check, color: "text-emerald-500", label: "Acceso completo" },
  read: { icon: Eye, color: "text-blue-500", label: "Solo lectura" },
  none: { icon: Minus, color: "text-muted-foreground/40", label: "Sin acceso" },
};

const CYCLE: AccessLevel[] = ["none", "read", "full"];

export default function RolePermissionsPage() {
  const navigate = useNavigate();
  const { data: perms, isLoading } = useRolePermissions();
  const { data: currentRole } = useUserRole();
  const updateMutation = useUpdatePermission();
  const isAdmin = currentRole === "admin";

  const getAccess = (role: AppRole, module: string): AccessLevel => {
    return perms?.[role]?.[module] ?? "none";
  };

  const handleCycle = (role: AppRole, module: string) => {
    if (!isAdmin || role === "admin") return;
    const current = getAccess(role, module);
    const nextIdx = (CYCLE.indexOf(current) + 1) % CYCLE.length;
    const next = CYCLE[nextIdx];
    updateMutation.mutate(
      { role, module, access_level: next },
      {
        onSuccess: () => toast.success(`${ROLE_LABELS[role]} → ${module}: ${accessConfig[next].label}`),
        onError: () => notifyError({ message: "Error al actualizar permiso" }),
      }
    );
  };

  const header = (
    <PageHeader
      title="Permisos por Rol"
      subtitle={isAdmin ? "Haz clic en un icono para cambiar el nivel de acceso" : "Consulta los niveles de acceso de cada rol del sistema por módulo"}
      action={
        <Button variant="outline" onClick={() => navigate("/users")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Usuarios
        </Button>
      }
    />
  );

  if (isLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          {header}
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        {header}

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
                    const canEdit = isAdmin && r !== "admin";
                    return (
                      <td key={r} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleCycle(r, mod)}
                          disabled={!canEdit}
                          className={cn(
                            "inline-flex items-center justify-center rounded-md p-1 transition-colors",
                            canEdit && "hover:bg-accent cursor-pointer",
                            !canEdit && "cursor-default opacity-80"
                          )}
                          title={canEdit ? "Clic para cambiar" : accessConfig[access].label}
                        >
                          <Icon className={cn("h-4 w-4", color)} />
                        </button>
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
