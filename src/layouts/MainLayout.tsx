import { useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Outlet } from "react-router";
import { KeyboardShortcutsDialog } from "@/components/feedback/KeyboardShortcutsDialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { usePageActionsContext } from "@/contexts/pageActions";
import { PageActionsProvider } from "@/contexts/PageActionsContext";
import { FeedbackFab } from "@/features/feedback";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { AppSidebar } from "@/layouts/AppSidebar";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { GlobalSearch } from "@/layouts/GlobalSearch";
import { useMainScrollRestoration } from "@/layouts/hooks/useMainScrollRestoration";
import { TopbarBreadcrumbs } from "@/layouts/TopbarBreadcrumbs";
import { NAV_SHORTCUTS } from "@/lib/shortcuts/registry";

function focusSearchInput() {
  const candidates = document.querySelectorAll<HTMLInputElement>(
    'input[type="search"], input[placeholder*="Buscar" i], input[aria-label*="Buscar" i]',
  );
  for (const el of candidates) {
    if (el.offsetParent !== null) {
      el.focus();
      el.select?.();
      return;
    }
  }
}

function HotkeysHost() {
  const navigate = useNavigateTransition();
  const { actions } = usePageActionsContext();
  const [helpOpen, setHelpOpen] = useState(false);

  // Combos con modificadores — permitidos siempre (también dentro de inputs).
  useHotkeys("mod+shift+n", (e) => { e.preventDefault(); actions.onNew?.(); }, { enableOnFormTags: true });
  useHotkeys("mod+shift+f", (e) => { e.preventDefault(); focusSearchInput(); }, { enableOnFormTags: true });
  useHotkeys("mod+/", (e) => { e.preventDefault(); setHelpOpen((v) => !v); }, { enableOnFormTags: true });

  // Teclas sueltas — sólo fuera de inputs (comportamiento por defecto).
  useHotkeys("shift+/", () => setHelpOpen((v) => !v)); // "?"
  useHotkeys("/", (e) => { e.preventDefault(); focusSearchInput(); });
  useHotkeys("n", () => actions.onNew?.());
  useHotkeys("r", () => actions.onRefresh?.());

  // Secuencias tipo Gmail (g + tecla) — navegación rápida.
  // `react-hotkeys-hook` v5 soporta secuencias con `sequenceSplitKey` (por defecto ">").
  const navByKey = useMemo(
    () => new Map(NAV_SHORTCUTS.map((n) => [n.key, n.url] as const)),
    [],
  );
  useHotkeys(
    NAV_SHORTCUTS.map((n) => `g>${n.key}`),
    (_e, handler) => {
      const second = handler.keys?.[handler.keys.length - 1];
      const url = second ? navByKey.get(second) : undefined;
      if (url) navigate(url);
    },
    { preventDefault: true },
    [navByKey, navigate],
  );

  return <KeyboardShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />;
}

export default function MainLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useMainScrollRestoration(mainRef);
  return (
    <SidebarProvider>
      <PageActionsProvider>
        <div className="min-h-[100dvh] flex w-full">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Saltar al contenido
          </a>
          <AppSidebar />
          <main ref={mainRef} id="main-content" className="flex-1 overflow-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <header className="sticky top-0 z-30 h-12 flex items-center gap-3 border-b px-4 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
              <SidebarTrigger className="touch:h-11 touch:w-11" />
              <div className="flex-1 min-w-0">
                <TopbarBreadcrumbs />
              </div>
              <FeedbackFab />
              <GlobalSearch />
            </header>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
        <HotkeysHost />
      </PageActionsProvider>
    </SidebarProvider>
  );
}
