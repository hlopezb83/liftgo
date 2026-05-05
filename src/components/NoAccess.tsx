import { useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/hooks/useUserRole";
import { ROLE_LABELS } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";

interface NoAccessProps {
  module?: string;
}

export function NoAccess({ module }: NoAccessProps) {
  const { data: role } = useUserRole();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

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
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Sin permisos para acceder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Tu rol actual no tiene acceso a esta sección. Si crees que es un error, recarga tu sesión o contacta a un administrador.
          </p>
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
