import { useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw, UserX, AlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/features/users";
import { ROLE_LABELS } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import type { AccessLevel } from "@/features/users";

export type NoAccessReason = "forbidden" | "no-role" | "error";

interface NoAccessProps {
  module?: string;
  reason?: NoAccessReason;
  requiredAccess?: AccessLevel;
  currentAccess?: AccessLevel;
}

const ACCESS_LABELS: Record<AccessLevel, string> = {
  full: "Acceso completo",
  read: "Solo lectura",
  none: "Sin acceso",
};

const REASON_CONFIG: Record<NoAccessReason, { icon: typeof Lock; title: string; description: string }> = {
  forbidden: {
    icon: Lock,
    title: "Sin permisos para acceder",
    description: "Tu rol actual no tiene el nivel de acceso requerido para esta sección. Si crees que es un error, recarga tu sesión o solicita permisos a un administrador.",
  },
  "no-role": {
    icon: UserX,
    title: "Sin rol asignado",
    description: "Tu cuenta no tiene un rol asignado todavía. Contacta a un administrador para que te asigne uno y puedas acceder al sistema.",
  },
  error: {
    icon: AlertTriangle,
    title: "No pudimos verificar tus permisos",
    description: "Ocurrió un error al cargar tu rol o permisos. Recarga tu sesión para reintentar; si el problema persiste, contacta a soporte.",
  },
};

export function NoAccess({ module, reason = "forbidden", requiredAccess, currentAccess }: NoAccessProps) {
  const { data: role } = useUserRole();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const config = REASON_CONFIG[reason];
  const Icon = config.icon;

  const handleReload = async () => {
    await queryClient.invalidateQueries();
    window.location.reload();
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="items-center text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>{config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">{config.description}</p>
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rol</span>
              <span className="font-medium">{role ? ROLE_LABELS[role] : "Sin rol asignado"}</span>
            </div>
            {module && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Módulo</span>
                <span className="font-medium">{module}</span>
              </div>
            )}
            {reason === "forbidden" && requiredAccess && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acceso requerido</span>
                <span className="font-medium">{ACCESS_LABELS[requiredAccess]}</span>
              </div>
            )}
            {reason === "forbidden" && currentAccess && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acceso actual</span>
                <span className="font-medium">{ACCESS_LABELS[currentAccess]}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleReload} className="flex-1" variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Recargar sesión
            </Button>
            <Button onClick={handleSignOut} variant="outline" className="flex-1">
              Cerrar sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
