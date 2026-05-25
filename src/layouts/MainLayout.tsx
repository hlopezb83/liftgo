import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/layouts/AppSidebar";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { TopbarBreadcrumbs } from "@/layouts/TopbarBreadcrumbs";
import { GlobalSearch } from "@/layouts/GlobalSearch";
import { FeedbackFab } from "@/features/feedback/components/FeedbackFab";

export default function MainLayout() {
  return (
    <SidebarProvider>
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
    </SidebarProvider>
  );
}
