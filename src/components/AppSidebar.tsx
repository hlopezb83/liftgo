import { LayoutDashboard, Truck, CalendarDays, BookOpen, Users, Wrench, Receipt, Settings, ClipboardCheck, TruckIcon, FileText, Activity, BarChart3, AlertTriangle, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Fleet", url: "/fleet", icon: Truck },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Bookings", url: "/bookings/new", icon: BookOpen },
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Returns", url: "/returns", icon: ClipboardCheck },
  { title: "Deliveries", url: "/deliveries", icon: TruckIcon },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Invoices", url: "/invoices", icon: Receipt },
  { title: "Maintenance", url: "/maintenance", icon: Wrench },
  { title: "Damage Tracking", url: "/damage", icon: AlertTriangle },
  { title: "Activity", url: "/activity", icon: Activity },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Equipment Config", url: "/settings/equipment", icon: Settings },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            FL
          </div>
          <div>
            <h2 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">ForkliftERP</h2>
            <p className="text-xs text-sidebar-foreground/60">Fleet Management</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <p className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">{user?.email}</p>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
