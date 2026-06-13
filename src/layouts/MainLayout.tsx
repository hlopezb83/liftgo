import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/layouts/AppSidebar";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { TopbarBreadcrumbs } from "@/layouts/TopbarBreadcrumbs";
import { GlobalSearch } from "@/layouts/GlobalSearch";
import { FeedbackFab } from "@/features/feedback";
import { PageActionsProvider, usePageActionsContext } from "@/contexts/PageActionsContext";
import { useHotkeys } from "@/hooks/useHotkeys";
import { NAV_SHORTCUTS } from "@/lib/shortcuts/registry";
import { KeyboardShortcutsDialog } from "@/components/feedback/KeyboardShortcutsDialog";

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
  const navigate = useNavigate();
  const { actions } = usePageActionsContext();
  const [helpOpen, setHelpOpen] = useState(false);

  const sequences: Record<string, Record<string, () => void>> = {
    g: NAV_SHORTCUTS.reduce<Record<string, () => void>>((acc, n) => {
      acc[n.key] = () => navigate(n.url);
      return acc;
    }, {}),
  };

  useHotkeys({
    combos: {
      "mod+shift+n": () => actions.onNew?.(),
      "mod+shift+f": () => focusSearchInput(),
      "mod+/": () => setHelpOpen((v) => !v),
      "?": () => setHelpOpen((v) => !v),
    },
    sequences,
    singles: {
      "/": () => focusSearchInput(),
      n: () => actions.onNew?.(),
      r: () => actions.onRefresh?.(),
    },
  });

  return <KeyboardShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />;
}

export default function MainLayout() {
  return (
    <SidebarProvider>
      <PageActionsProvider>
        <div className="min-h-[100dvh] flex w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
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
