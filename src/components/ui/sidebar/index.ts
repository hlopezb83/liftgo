/**
 * Barrel del primitivo Sidebar (shadcn) — partido en módulos ≤150 LOC.
 *
 * Mantiene la API pública intacta: cualquier consumer que importe desde
 * `@/components/ui/sidebar` sigue resolviendo aquí sin cambios.
 */
export { SidebarProvider, useSidebar } from "./context";
export { Sidebar, SidebarTrigger, SidebarRail, SidebarInset } from "./Sidebar";
export {
  SidebarInput,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarContent,
} from "./SidebarSections";
export {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
} from "./SidebarGroup";
export {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
} from "./SidebarMenu";
export {
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "./SidebarMenuSub";
