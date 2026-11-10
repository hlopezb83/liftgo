// Preserve the sidebar public contract while sharing neutral navigation metadata.
export { NAV_GROUPS } from "@/lib/navigation/navigationCatalog";
export type { NavItem, NavGroup, SidebarBadgeKey } from "@/lib/navigation/navigationCatalog";

// Items that bypass the permissions check
// v7.226.0 · E2E-N8: quitar /audit y /activity del always-visible — ahora
// se resuelven contra el módulo "Auditoría" en useRolePermissions.
export { ALWAYS_VISIBLE_ROUTES } from "@/features/users";
