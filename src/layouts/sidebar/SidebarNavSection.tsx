import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentVersion } from "@/features/changelog";
import { NavLink } from "@/layouts/NavLink";
import { routeLoaders } from "@/routes/routes-config";
import { useSidebarBadgeCounts } from "./useSidebarBadgeCounts";
import type { NavGroup, NavItem } from "./navConfig";

// Debounce igual al de tablas: dispara el `import()` sólo si el hover
// sostiene 120ms. Evita cargar chunks al pasar el cursor sin intención.
const PREFETCH_DELAY_MS = 120;

// Persistencia del estado colapsado por grupo. Keyed por label del grupo
// (estable tras la reorganización; renombrar un grupo solo resetea SU estado).
const NAV_GROUPS_STORAGE_KEY = "liftgo:sidebar:nav-groups-v1";
const LAST_SEEN_VERSION_KEY = "liftgo:lastSeenVersion";
// Evento in-tab: el `storage` nativo sólo dispara entre pestañas distintas,
// así que emitimos uno propio cuando ChangelogPage escribe la versión vista.
const LAST_SEEN_EVENT = "liftgo:lastSeenVersion";

function readNavGroupState(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY) ?? "{}");
  } catch {
    return {}; // storage lleno/corrupto/bloqueado → defaults
  }
}

function writeNavGroupState(label: string, open: boolean) {
  try {
    const state = readNavGroupState();
    state[label] = open;
    window.localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // modo privado / sin storage → la sesión simplemente no persiste
  }
}

function subscribeLastSeen(cb: () => void) {
  window.addEventListener(LAST_SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LAST_SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getLastSeenSnapshot(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function useLastSeenVersion(): string | null {
  return useSyncExternalStore(subscribeLastSeen, getLastSeenSnapshot, () => null);
}

function NavMenuItem({ item }: { item: NavItem }) {
  const timerRef = useRef<number | null>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const loader = routeLoaders[item.url];
  const { pathname } = useLocation();
  const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);

  const { data: counts } = useSidebarBadgeCounts();
  const currentVersion = useCurrentVersion();
  const numericCount =
    item.badgeKey && item.badgeKey !== "changelog_new" ? counts?.[item.badgeKey] ?? 0 : 0;
  const lastSeenVersion = useLastSeenVersion();
  const isChangelogNew =
    item.badgeKey === "changelog_new" &&
    !!currentVersion &&
    lastSeenVersion !== currentVersion;

  // Auto-scroll (a11y): en sidebars largos (10 grupos) el ítem activo puede
  // quedar fuera del viewport al entrar directo a una URL profunda.
  useEffect(() => {
    if (isActive) itemRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  const schedulePrefetch = () => {
    if (!loader || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      loader();
    }, PREFETCH_DELAY_MS);
  };
  const cancelPrefetch = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <SidebarMenuItem ref={itemRef}>
      <SidebarMenuButton asChild tooltip={item.title}>
        <NavLink
          to={item.url}
          end={item.url === "/"}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
          onMouseEnter={schedulePrefetch}
          onMouseLeave={cancelPrefetch}
          onFocus={schedulePrefetch}
          onBlur={cancelPrefetch}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
      {numericCount > 0 && (
        <SidebarMenuBadge
          aria-label={`${numericCount} pendientes`}
          className="bg-sidebar-primary/15 text-sidebar-primary"
        >
          {numericCount}
        </SidebarMenuBadge>
      )}
      {isChangelogNew && (
        <SidebarMenuBadge
          aria-label="Hay novedades"
          className="bg-amber-500/20 text-amber-600"
        >
          •
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

export function SidebarNavSection({ group }: { group: NavGroup }) {
  const { state } = useSidebar();
  const collapsedSidebar = state === "collapsed";
  const { pathname } = useLocation();
  const hasActive = group.items.some(
    (i) => i.url === "/" ? pathname === "/" : pathname.startsWith(i.url),
  );
  // Prioridad: lo que el usuario dejó guardado > defaultOpen del grupo > activo.
  const [open, setOpen] = useState(() => {
    const persisted = readNavGroupState()[group.label];
    return persisted ?? group.defaultOpen ?? hasActive;
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    writeNavGroupState(group.label, next);
  };

  // En modo icon o cuando el grupo no es colapsable, render plano.
  if (!group.collapsible || collapsedSidebar) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => <NavMenuItem key={item.title} item={item} />)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open || hasActive} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            className="cursor-pointer flex items-center justify-between hover:text-sidebar-foreground"
          >
            <span>{group.label}</span>
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${open || hasActive ? "rotate-90" : ""}`}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => <NavMenuItem key={item.title} item={item} />)}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}
