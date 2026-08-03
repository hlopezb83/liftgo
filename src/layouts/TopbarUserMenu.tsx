import { useTheme } from "next-themes";
import { useState } from "react";
import { KeyIcon, LogOut, Moon, Sun } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import { ChangePasswordDialog } from "@/layouts/sidebar/ChangePasswordDialog";
import { getUserInitials } from "@/layouts/sidebar/userIdentity";
import { ROLE_LABELS } from "@/lib/constants";

/**
 * R12 UI/UX Fase 2 (punto 1): identidad del usuario en la barra superior.
 * Antes sólo vivía en el pie del sidebar (invisible al colapsar).
 */
export function TopbarUserMenu() {
  const { user, signOut } = useAuth();
  const { data: role } = useUserRole();
  const { theme, setTheme } = useTheme();
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  const isDark = theme === "dark";
  const email = user?.email ?? "";
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menú de usuario"
            title={email}
            className="rounded-full h-8 w-8 touch:h-11 touch:w-11 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold"
          >
            {getUserInitials(email)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="text-sm font-medium truncate" title={email}>{email}</p>
            {roleLabel && (
              <p className="text-3xs uppercase tracking-wide text-muted-foreground font-medium">
                {roleLabel}
              </p>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {isDark ? "Tema claro" : "Tema oscuro"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPwDialogOpen(true)}>
            <KeyIcon className="mr-2 h-4 w-4" /> Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
    </>
  );
}
