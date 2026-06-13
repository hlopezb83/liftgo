import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import { useCompanySettings } from "@/features/company-settings";
import { useCurrentVersion } from "@/features/changelog";
import { useVisibleNavGroups } from "@/layouts/hooks/useVisibleNavGroups";
import { SidebarBranding } from "@/layouts/sidebar/SidebarBranding";
import { SidebarNavSection } from "@/layouts/sidebar/SidebarNavSection";
import { SidebarUserFooter } from "@/layouts/sidebar/SidebarUserFooter";

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
        role={role ?? undefined}
        currentVersion={currentVersion}
        onSignOut={signOut}
      />
    </Sidebar>
  );
}
