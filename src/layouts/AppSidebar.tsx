import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentVersion } from "@/features/changelog";
import { useUserRole } from "@/features/users";
import { useSidebarOrganizationName } from "@/layouts/hooks/useSidebarOrganizationName";
import { useVisibleNavGroups } from "@/layouts/hooks/useVisibleNavGroups";
import { SidebarBranding } from "@/layouts/sidebar/SidebarBranding";
import { SidebarNavSection } from "@/layouts/sidebar/SidebarNavSection";
import { SidebarQuickCreate } from "@/layouts/sidebar/SidebarQuickCreate";
import { SidebarUserFooter } from "@/layouts/sidebar/SidebarUserFooter";

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { data: role } = useUserRole();
  const { data: organizationName } = useSidebarOrganizationName();
  const currentVersion = useCurrentVersion();
  const visibleNavGroups = useVisibleNavGroups();

  return (
    <Sidebar collapsible="icon">
      <SidebarBranding razonSocial={organizationName} />
      <SidebarQuickCreate />
      <SidebarContent className="pb-6">
        {visibleNavGroups.map((group) => (
          <SidebarNavSection key={group.label} group={group} />
        ))}
      </SidebarContent>
      <SidebarUserFooter
        email={user?.email}
        role={role ?? undefined}
        currentVersion={currentVersion}
        onSignOut={signOut}
      />
    </Sidebar>
  );
}
