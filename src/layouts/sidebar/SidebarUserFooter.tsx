import { useState } from "react";
import { LogOut, KeyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SidebarFooter } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppRole } from "@/features/users";
import { NavLink } from "@/layouts/NavLink";
import { ChangePasswordDialog } from "@/layouts/sidebar/ChangePasswordDialog";
import { ROLE_LABELS } from "@/lib/constants";
import { ThemeToggle } from "./ThemeToggle";

interface SidebarUserFooterProps {
  email?: string | null;
  role?: AppRole;
  currentVersion?: string | null;
  onSignOut: () => void;
}

export function SidebarUserFooter({ email, role, currentVersion, onSignOut }: SidebarUserFooterProps) {
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  return (
    <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2">
      <div className="min-w-0">
        <p className="text-xs text-sidebar-foreground/80 truncate" title={email ?? ""}>{email}</p>
        {role && (
          <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wide font-medium">
            {ROLE_LABELS[role] ?? role}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Cambiar contraseña" onClick={() => setPwDialogOpen(true)} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                <KeyIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cambiar contraseña</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Cerrar sesión" onClick={onSignOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cerrar sesión</TooltipContent>
          </Tooltip>
        </div>
        {currentVersion && (
          <NavLink to="/changelog" className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors font-mono shrink-0">
            v{currentVersion}
          </NavLink>
        )}
      </div>
      <ChangePasswordDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
    </SidebarFooter>
  );
}
