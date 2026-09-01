import { useState } from "react";
import { LogOut, KeyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppRole } from "@/features/users";
import { NavLink } from "@/layouts/NavLink";
import { ChangePasswordDialog } from "@/layouts/sidebar/ChangePasswordDialog";
import { getUserInitials } from "@/layouts/sidebar/userIdentity";
import { ROLE_LABELS } from "@/lib/constants";
import { ThemeToggle } from "./ThemeToggle";

interface SidebarUserFooterProps {
  email?: string | null;
  role?: AppRole;
  currentVersion?: string | null;
  onSignOut: () => void;
}

function IconAction({
  label,
  onClick,
  children,
  isMobile,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  isMobile: boolean;
}) {
  const btn = (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
    >
      {children}
    </Button>
  );
  if (isMobile) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarUserFooter({ email, role, currentVersion, onSignOut }: SidebarUserFooterProps) {
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const { isMobile } = useSidebar();

  return (
    <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2 group-data-[collapsible=icon]:p-1.5 group-data-[collapsible=icon]:space-y-1">
      <div className="min-w-0 flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
        <span
          aria-hidden
          className="shrink-0 grid place-items-center h-7 w-7 rounded-full bg-sidebar-primary/15 text-sidebar-primary text-2xs font-semibold"
        >
          {getUserInitials(email)}
        </span>
        {/* En modo icono el rail mide 3rem: correo, rol y versión se desbordaban. */}
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
        <p className="text-xs text-sidebar-foreground/80 truncate" title={email ?? ""}>{email}</p>
        {role && (
          <p className="text-3xs text-sidebar-foreground/50 uppercase tracking-wide font-medium">
            {ROLE_LABELS[role] ?? role}
          </p>
        )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0">
        <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0">
          <ThemeToggle />
          <IconAction label="Cambiar contraseña" onClick={() => setPwDialogOpen(true)} isMobile={isMobile}>
            <KeyIcon className="h-4 w-4" />
          </IconAction>
          <IconAction label="Cerrar sesión" onClick={onSignOut} isMobile={isMobile}>
            <LogOut className="h-4 w-4" />
          </IconAction>
        </div>
        {currentVersion && (
          <NavLink to="/changelog" className="text-3xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors font-mono shrink-0 group-data-[collapsible=icon]:hidden">
            v{currentVersion}
          </NavLink>
        )}
      </div>

      <ChangePasswordDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
    </SidebarFooter>
  );
}
