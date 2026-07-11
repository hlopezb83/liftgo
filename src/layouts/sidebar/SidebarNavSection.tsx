import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRightIcon } from "@/components/icons";
import { NavLink } from "@/layouts/NavLink";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { NavGroup, NavItem } from "./navConfig";

function NavMenuItem({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
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
  );
}

export function SidebarNavSection({ group }: { group: NavGroup }) {
  const { state } = useSidebar();
  const collapsedSidebar = state === "collapsed";
  const { pathname } = useLocation();
  const hasActive = group.items.some(
    (i) => i.url === "/" ? pathname === "/" : pathname.startsWith(i.url),
  );
  const [open, setOpen] = useState(hasActive);

  // En modo icon o cuando el grupo no es colapsable, render plano.
  if (!group.collapsible || collapsedSidebar) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => <NavMenuItem key={item.title} item={item} />)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open || hasActive} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            className="cursor-pointer flex items-center justify-between hover:text-sidebar-foreground"
          >
            <span>{group.label}</span>
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${open || hasActive ? "rotate-90" : ""}`}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => <NavMenuItem key={item.title} item={item} />)}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}
