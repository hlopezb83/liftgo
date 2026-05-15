import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TopbarBreadcrumbs } from "@/components/TopbarBreadcrumbs";
import { GlobalSearch } from "@/components/GlobalSearch";
import { FeedbackFab } from "@/features/feedback/components/FeedbackFab";

export default function MainLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="h-12 flex items-center gap-3 border-b px-4 bg-card">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <TopbarBreadcrumbs />
            </div>
            <GlobalSearch />
          </header>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <FeedbackFab />
      </div>
    </SidebarProvider>
  );
}
