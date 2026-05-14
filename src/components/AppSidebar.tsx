import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentVersion } from "@/hooks/useChangelog";
import { useVisibleNavGroups } from "@/hooks/useVisibleNavGroups";
import { SidebarBranding } from "@/components/sidebar/SidebarBranding";
import { SidebarNavSection } from "@/components/sidebar/SidebarNavSection";
import { SidebarUserFooter } from "@/components/sidebar/SidebarUserFooter";

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { data: role } = useUserRole();
  const { data: company } = useCompanySettings();
  const currentVersion = useCurrentVersion();
  const visibleNavGroups = useVisibleNavGroups();

  return (
    <Sidebar>
      <SidebarBranding logoUrl={company?.logo_url} razonSocial={company?.razon_social} />
      <SidebarContent>
        {visibleNavGroups.map((group) => (
          <SidebarNavSection key={group.label} group={group} />
        ))}
      </SidebarContent>
      <SidebarUserFooter
        email={user?.email}
        role={role}
        currentVersion={currentVersion}
        onSignOut={signOut}
      />
    </Sidebar>
  );
}
