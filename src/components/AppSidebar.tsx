import { LayoutDashboard, Truck, CalendarDays, BookOpen, Users, Wrench, Receipt, Settings, ClipboardCheck, TruckIcon, FileText, Activity, BarChart3, AlertTriangle, LogOut, ShieldCheck, Moon, Sun, Building2, ScrollText, History } from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import type { AppRole } from "@/hooks/useUserRole";
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

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: AppRole[]; // undefined = all roles
};

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Fleet", url: "/fleet", icon: Truck },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Bookings", url: "/bookings/new", icon: BookOpen, roles: ["admin", "dispatcher"] },
  { title: "Quotes", url: "/quotes", icon: FileText, roles: ["admin", "dispatcher"] },
  { title: "Contracts", url: "/contracts", icon: ScrollText, roles: ["admin", "dispatcher"] },
  { title: "Returns", url: "/returns", icon: ClipboardCheck, roles: ["admin", "dispatcher"] },
  { title: "Deliveries", url: "/deliveries", icon: TruckIcon, roles: ["admin", "dispatcher"] },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Invoices", url: "/invoices", icon: Receipt, roles: ["admin", "dispatcher"] },
  { title: "Maintenance", url: "/maintenance", icon: Wrench },
  { title: "Damage Tracking", url: "/damage", icon: AlertTriangle },
  { title: "Activity", url: "/activity", icon: Activity },
  { title: "Audit Trail", url: "/audit", icon: History, roles: ["admin", "dispatcher"] },
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin", "dispatcher"] },
  { title: "Operations Setup", url: "/settings/operations", icon: Settings, roles: ["admin"] },
  { title: "Datos Fiscales", url: "/settings/company", icon: Building2, roles: ["admin"] },
  { title: "User Management", url: "/users", icon: ShieldCheck, roles: ["admin"] },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { data: role } = useUserRole();

  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  );

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
              {visibleItems.map((item) => (
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
      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">{user?.email}</p>
          <div className="flex gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
