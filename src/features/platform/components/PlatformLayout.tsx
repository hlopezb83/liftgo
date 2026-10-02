import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import {
  CompanyIcon,
  FleetIcon,
  HistoryIcon,
  HomeIcon,
  LogOut,
  Menu,
  SecurityIcon,
  UsersIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentVersion } from "@/features/changelog";
import { PLATFORM_PROFILE_LABELS } from "@/lib/platformAccess.types";
import { useLocation } from "@/lib/router-compat";
import { Link, Outlet } from "@/lib/router-compat-ui";
import { setAppVersion } from "@/lib/ui/errorReport";
import { cn } from "@/lib/utils";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { canAccessPlatformRoute } from "../hooks/usePlatformAccess";
import { ORGANIZATION_WORKSPACE } from "../lib/platformNavigation";

const NAV = [
  { to: "/platform", label: "Inicio", icon: HomeIcon },
  { to: "/platform/organizations", label: "Empresas", icon: CompanyIcon },
  { to: "/platform/catalogs", label: "Catálogo LiftGo", icon: FleetIcon },
  { to: "/platform/audit", label: "Bitácora global", icon: HistoryIcon },
  { to: "/platform/operators", label: "Operadores", icon: UsersIcon },
  { to: "/platform/security", label: "Mi sesión", icon: SecurityIcon },
];

export function PlatformLayout() {
  const { access } = usePlatformCapabilities();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const version = useCurrentVersion();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (version) setAppVersion(version);
  }, [version]);
  const title =
    NAV.find(
      (item) =>
        item.to === pathname.replace(/\/$/, "") ||
        (item.to !== "/platform" && pathname.startsWith(`${item.to}/`)),
    )?.label ?? "Centro de Plataforma";

  function navigation() {
    return (
      <nav aria-label="Centro de Plataforma" className="space-y-1 p-3">
        {NAV.filter((item) => access && canAccessPlatformRoute(access, item.to)).map(({ to, label, icon: Icon }) => {
          const active =
            pathname.replace(/\/$/, "") === to ||
            (to !== "/platform" && pathname.startsWith(`${to}/`));
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <a
        href="#platform-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Saltar al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="space-y-4 border-b border-sidebar-border p-6">
          <div className="inline-flex rounded-lg bg-card p-3">
            <BrandLockup size="lg" />
          </div>
          <div>
            <p className="font-semibold">Centro de Plataforma</p>
            <p className="mt-1 text-xs text-sidebar-foreground/65">
              Administración global
            </p>
          </div>
        </div>
        {navigation()}
        <div className="mt-auto space-y-3 border-t border-sidebar-border p-4">
          <p className="break-all text-xs text-sidebar-foreground/75">
            {user?.email}
          </p>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
          {version && (
            <p className="text-xs text-sidebar-foreground/50">v{version}</p>
          )}
        </div>
      </aside>
      <div className="min-w-0 md:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Abrir navegación"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetHeader className="border-b border-sidebar-border p-6">
                  <SheetTitle className="text-sidebar-foreground">
                    Centro de Plataforma
                  </SheetTitle>
                  <SheetDescription className="text-sidebar-foreground/65">
                    Administración global de LiftGo
                  </SheetDescription>
                </SheetHeader>
                {navigation()}
                <Button
                  variant="ghost"
                  className="m-3 text-sidebar-foreground"
                  onClick={() => void signOut()}
                >
                  Cerrar sesión
                </Button>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium">{title}</span>
            <Badge variant="outline" className="gap-1">
              <SecurityIcon className="h-3 w-3" />
              {access?.profile ? PLATFORM_PROFILE_LABELS[access.profile] : "Plataforma"}
            </Badge>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={ORGANIZATION_WORKSPACE}>ERP de mi empresa</Link>
          </Button>
        </header>
        <main
          id="platform-content"
          className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
