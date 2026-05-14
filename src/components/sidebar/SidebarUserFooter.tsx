import { useState } from "react";
import { LogOut, KeyRound } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarFooter } from "@/components/ui/sidebar";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { ThemeToggle } from "./ThemeToggle";
import { ROLE_LABELS } from "@/lib/constants";
import type { AppRole } from "@/hooks/useUserRole";

interface SidebarUserFooterProps {
  email?: string | null;
  role?: AppRole;
  currentVersion?: string | null;
  onSignOut: () => void;
}

export function SidebarUserFooter({ email, role, currentVersion, onSignOut }: SidebarUserFooterProps) {
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  return (
    <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-sidebar-foreground/80 truncate" title={email ?? ""}>{email}</p>
          {role && (
            <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wide font-medium">
              {ROLE_LABELS[role] ?? role}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Cambiar contraseña" onClick={() => setPwDialogOpen(true)} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                <KeyRound className="h-4 w-4" />
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
      </div>
      {currentVersion && (
        <NavLink to="/changelog" className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors font-mono">
          v{currentVersion}
        </NavLink>
      )}
      <ChangePasswordDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
    </SidebarFooter>
  );
}
