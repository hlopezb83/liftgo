import { SidebarHeader } from "@/components/ui/sidebar";

interface SidebarBrandingProps {
  logoUrl?: string | null;
  razonSocial?: string | null;
}

export function SidebarBranding({ logoUrl, razonSocial }: SidebarBrandingProps) {
  const name = razonSocial || "Lift Go";
  return (
    <SidebarHeader className="p-4 border-b border-sidebar-border">
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
