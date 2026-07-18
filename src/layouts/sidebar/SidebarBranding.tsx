import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";

interface SidebarBrandingProps {
  logoUrl?: string | null;
  razonSocial?: string | null;
}

export function SidebarBranding({ logoUrl, razonSocial }: SidebarBrandingProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const name = razonSocial || "Lift Go";
  return (
    <SidebarHeader className="relative p-4 border-b border-sidebar-border">
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar menú"
          title="Cerrar menú"
          onClick={() => setOpenMobile(false)}
          className="absolute right-2 top-2 h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}
      <div className="flex flex-col items-center text-center gap-2.5 min-w-0">
        {logoUrl ? (
          // intentional: bg-white required to guarantee logo contrast on dark sidebars
          <div className="flex h-12 max-w-[10rem] items-center justify-center rounded-md bg-white px-3 py-1.5 shrink-0">
            <img
              src={logoUrl}
              alt="Logo"
              className="h-full w-auto max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-gold text-sidebar-primary-foreground font-bold text-lg">
            LG
          </div>
        )}
        <div className="min-w-0">
          <h2
            className="text-sm font-semibold text-sidebar-primary-foreground tracking-tight leading-tight line-clamp-2 break-words"
            title={name}
          >
            {name}
          </h2>
          <p className="text-2xs text-sidebar-foreground/60 truncate">Montacargas</p>
        </div>
      </div>
    </SidebarHeader>
  );
}
