import { SidebarHeader } from "@/components/ui/sidebar";

interface SidebarBrandingProps {
  logoUrl?: string | null;
  razonSocial?: string | null;
}

export function SidebarBranding({ logoUrl, razonSocial }: SidebarBrandingProps) {
  const name = razonSocial || "Lift Go";
  return (
    <SidebarHeader className="p-3 border-b border-sidebar-border">
      <div className="flex items-center gap-2.5 min-w-0">
        {logoUrl ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent p-1">
            <img src={logoUrl} alt="Logo" className="h-full w-full rounded object-contain" />
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gold text-sidebar-primary-foreground font-bold text-sm">
            LG
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2
            className="text-sm font-semibold text-sidebar-primary-foreground tracking-tight leading-tight line-clamp-2 break-words"
            title={name}
          >
            {name}
          </h2>
          <p className="text-[11px] text-sidebar-foreground/60 truncate">Montacargas</p>
        </div>
      </div>
    </SidebarHeader>
  );
}
