import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "./pages/Dashboard";
import Fleet from "./pages/Fleet";
import ForkliftDetail from "./pages/ForkliftDetail";
import ForkliftForm from "./pages/ForkliftForm";
import CalendarPage from "./pages/CalendarPage";
import BookingForm from "./pages/BookingForm";
import CustomersPage from "./pages/CustomersPage";
import MaintenancePage from "./pages/MaintenancePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <div className="min-h-screen flex w-full">
            <AppSidebar />
            <main className="flex-1 overflow-auto">
              <header className="h-12 flex items-center border-b px-4 bg-card">
                <SidebarTrigger />
              </header>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/fleet" element={<Fleet />} />
                <Route path="/fleet/new" element={<ForkliftForm />} />
                <Route path="/fleet/:id" element={<ForkliftDetail />} />
                <Route path="/fleet/:id/edit" element={<ForkliftForm />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/bookings/new" element={<BookingForm />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/maintenance" element={<MaintenancePage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
