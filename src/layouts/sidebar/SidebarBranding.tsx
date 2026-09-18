import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";

/**
 * Marca de producto en la navegación.
 *
 * SIEMPRE muestra el asset global de LiftGo del repositorio (fuente local
 * fija), idéntico para cualquier empresa. NO consume `company_settings.logo_url`
 * ni firma nada por organización: la marca del producto no es dato de tenant.
 * La razón social sólo acompaña como texto.
 */
interface SidebarBrandingProps {
  razonSocial?: string | null;
}

export function SidebarBranding({ razonSocial }: SidebarBrandingProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const name = razonSocial || "Lift Go";
  return (
    <SidebarHeader className="relative p-4 border-b border-sidebar-border group-data-[collapsible=icon]:p-2">
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar menú"
          title="Cerrar menú"
          onClick={() => setOpenMobile(false)}
          className="absolute right-2 top-2 h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <CloseIcon className="h-4 w-4" />
        </Button>
      )}
      <div className="flex flex-col items-center text-center gap-2.5 min-w-0">
        {/* Asset global LiftGo: distintivo del producto, igual en todo tenant. */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-gold text-sidebar-primary-foreground font-bold text-lg group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:text-2xs group-data-[collapsible=icon]:rounded-md">
          LG
        </div>

        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <h2
            className="text-sm font-semibold text-sidebar-primary-foreground tracking-tight leading-tight line-clamp-2 break-words"
            title={name}
          >
            {name}
          </h2>
          <p className="text-2xs text-sidebar-foreground/60">Montacargas</p>
        </div>
      </div>
    </SidebarHeader>
  );
}
