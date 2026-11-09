import { describe, expect, it } from "vitest";
import { DashboardIcon, CalendarDays, BookOpen, DeliveryIcon, ClipboardCheck, TargetIcon, UsersIcon, DocumentIcon, ScrollText, FleetIcon, MaintenanceIcon, WarnIcon, InventoryIcon, InvoiceIcon, GitCompareArrows, TrendingUpIcon, BankIcon, ArrowLeftRight, ChartIcon, SupplierIcon, FileClock, ActivityIcon, HistoryIcon, SecurityIcon, SettingsIcon, HelpIcon, MessageSquare, TrophyIcon, Megaphone, ExpenseIcon, CompanyIcon } from "@/components/icons";
import { NAV_GROUPS as sidebarGroups } from "@/layouts/sidebar/navConfig";
import { NAV_GROUPS, SEARCH_NAVIGATION_ITEMS } from "../navigationCatalog";
import baseline from "./fixtures/surfaces.json";

const icons = { DashboardIcon, CalendarDays, BookOpen, DeliveryIcon, ClipboardCheck, TargetIcon, UsersIcon, DocumentIcon, ScrollText, FleetIcon, MaintenanceIcon, WarnIcon, InventoryIcon, InvoiceIcon, GitCompareArrows, TrendingUpIcon, BankIcon, ArrowLeftRight, ChartIcon, SupplierIcon, FileClock, ActivityIcon, HistoryIcon, SecurityIcon, SettingsIcon, HelpIcon, MessageSquare, TrophyIcon, Megaphone, ExpenseIcon, CompanyIcon };

// Captured from main 8644a7fe before extraction. Keep this independent of the
// catalog: additions/removals or changes to either surface must be intentional.
function resolveIcons<T extends { icon: string }>(items: T[]) {
  return items.map(({ icon, ...item }) => ({ ...item, icon: icons[icon as keyof typeof icons] }));
}

describe("navigation surface contracts", () => {
  it("preserves every sidebar group, item, icon, badge and collapse setting in order", () => {
    expect(sidebarGroups).toBe(NAV_GROUPS);
    expect(NAV_GROUPS).toEqual(baseline.sidebar.map(({ items, ...group }) => ({ ...group, items: resolveIcons(items) })));
  });

  it("preserves every search title, URL, icon, group, keyword and order", () => {
    expect(SEARCH_NAVIGATION_ITEMS).toEqual(resolveIcons(baseline.search));
  });

  it("keeps surface-specific coverage, including the expenses alias and platform restriction", () => {
    const sidebar = NAV_GROUPS.flatMap((group) => group.items);
    const sidebarUrls = sidebar.map((item) => item.url);
    const searchUrls = SEARCH_NAVIGATION_ITEMS.map((item) => item.url);
    expect(new Set(sidebarUrls).size).toBe(sidebar.length);
    expect(new Set(searchUrls).size).toBe(SEARCH_NAVIGATION_ITEMS.length);
    expect(sidebarUrls).toContain("/cuentas-por-pagar");
    expect(sidebarUrls).not.toContain("/expenses");
    expect(searchUrls).toContain("/expenses");
    expect(searchUrls).not.toContain("/cuentas-por-pagar");
    expect(searchUrls).not.toContain("/platform");
    expect(sidebar.filter((item) => item.platformOperatorOnly).map((item) => item.url)).toEqual(["/platform"]);
    // The dynamic organization destination belongs to useVisibleNavGroups.
    expect(sidebar.find((item) => item.url === "/")?.destination).toBeUndefined();
  });
});
