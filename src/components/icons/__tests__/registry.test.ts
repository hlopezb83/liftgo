import { describe, it, expect } from "vitest";
import * as Icons from "@/components/icons";

/**
 * Guardrail del registry de íconos:
 * cada alias semántico canónico debe resolver a un componente válido.
 * Si alguien elimina un alias o rompe el re-export, este test lo detecta.
 */
const CANONICAL_ALIASES = [
  // CRUD
  "AddIcon", "EditIcon", "DeleteIcon", "SaveIcon", "DuplicateIcon",
  "RefreshIcon", "DownloadIcon", "UploadIcon", "ViewIcon", "HideIcon",
  "SearchIcon", "RemoveIcon", "UndoIcon", "ResetIcon",
  // Feedback / estado
  "SuccessIcon", "WarnIcon", "ErrorIcon", "InfoAlertIcon", "InfoIcon",
  "SpinnerIcon",
  // Navegación
  "ChevronRightIcon", "ChevronLeftIcon", "ChevronUpIcon", "ChevronDownIcon",
  "BackIcon", "CloseIcon", "HomeIcon",
  // Dominio LiftGo
  "FleetIcon", "MaintenanceIcon", "DocumentIcon", "InvoiceIcon", "MoneyIcon",
  "PaymentIcon", "CostIcon", "ExpenseIcon",
  "CalendarIcon", "OverdueIcon", "ClockIcon", "UserIcon", "UsersIcon",
  "CompanyIcon", "SupplierIcon", "SecurityIcon", "InventoryIcon",
  "WaitingPartsIcon", "HistoryIcon", "PhoneIcon", "LocationIcon",
  "BankIcon", "DealIcon", "StampIcon", "SignIcon", "DeliveryIcon",
  "VerifiedDocIcon", "SettingsIcon", "DashboardIcon",
  "ChartIcon", "TrendingUpIcon", "TrendingDownIcon", "TargetIcon",
  "TrophyIcon", "ActivityIcon", "StarIcon", "HelpIcon", "KeyIcon",
] as const;

describe("icons registry", () => {
  it.each(CANONICAL_ALIASES)("exporta el alias canónico %s", (name) => {
    const icon = (Icons as Record<string, unknown>)[name];
    expect(icon, `alias ${name} no está exportado desde @/components/icons`).toBeDefined();
    expect(typeof icon === "function" || typeof icon === "object").toBe(true);
  });

  it("exporta el wrapper Icon (deferred import)", async () => {
    const mod = await import("@/components/icons/Icon");
    expect(typeof mod.Icon).toBe("function");
  });
});
