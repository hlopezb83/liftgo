/**
 * Registro central de íconos.
 *
 * Regla del proyecto: NINGÚN archivo fuera de `src/components/icons/` debe
 * importar directamente de `lucide-react`. En su lugar:
 *
 *   import { DeleteIcon, EditIcon, AddIcon } from "@/components/icons";
 *
 * Preferir SIEMPRE el alias semántico sobre el nombre crudo de lucide:
 *
 *   ✅ import { DeleteIcon } from "@/components/icons";
 *   ❌ import { DeleteIcon } from "@/components/icons";
 *
 * Íconos sin alias canónico se re-exportan tal cual (bloque 2) para casos
 * ad-hoc y decorativos.
 *
 * Ganancias:
 *   1. Consolida duplicados semánticos (Check/CheckCircle/CheckCircle2 → SuccessIcon).
 *   2. Renombrar/cambiar de librería sin tocar 247 archivos.
 *   3. Enforce vía ESLint (no-restricted-imports sobre lucide-react).
 *
 * Tabla rápida por dominio:
 *   CRUD             → AddIcon, EditIcon, DeleteIcon, SaveIcon, DuplicateIcon,
 *                      RefreshIcon, DownloadIcon, UploadIcon, ViewIcon, HideIcon,
 *                      SearchIcon, RemoveIcon, UndoIcon, ResetIcon
 *   Feedback/estado  → SuccessIcon, WarnIcon, ErrorIcon, InfoAlertIcon, InfoIcon,
 *                      SpinnerIcon
 *   Navegación       → ChevronLeft/Right/Up/DownIcon, BackIcon, CloseIcon, HomeIcon
 *   Dominio LiftGo   → FleetIcon, MaintenanceIcon, DocumentIcon, InvoiceIcon,
 *                      MoneyIcon, CalendarIcon, ClockIcon, UserIcon, UsersIcon,
 *                      CompanyIcon, SecurityIcon, InventoryIcon, HistoryIcon,
 *                      PhoneIcon, LocationIcon, BankIcon, DealIcon, StampIcon,
 *                      SettingsIcon, DashboardIcon, ChartIcon, TrendingUpIcon,
 *                      TrendingDownIcon, TargetIcon, TrophyIcon, ActivityIcon,
 *                      StarIcon, HelpIcon, KeyIcon
 */

// -----------------------------------------------------------------------------
// 1. Aliases semánticos canónicos — usar SIEMPRE que aplique la acción.
// -----------------------------------------------------------------------------
export {
  // Acciones CRUD
  Plus as AddIcon,
  Pencil as EditIcon,
  DeleteIcon as DeleteIcon,
  Save as SaveIcon,
  Copy as DuplicateIcon,
  RefreshCw as RefreshIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Eye as ViewIcon,
  EyeOff as HideIcon,
  Search as SearchIcon,
  Minus as RemoveIcon,
  Undo2 as UndoIcon,
  RotateCcw as ResetIcon,

  // Estado / feedback (dedupe: Check/CheckCircle/CheckCircle2 → SuccessIcon)
  CheckCircle2 as SuccessIcon,
  AlertTriangle as WarnIcon,
  XCircle as ErrorIcon,
  AlertCircle as InfoAlertIcon,
  Info as InfoIcon,
  Loader2 as SpinnerIcon,

  // Navegación
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronUp as ChevronUpIcon,
  ArrowLeft as BackIcon,
  X as CloseIcon,
  Home as HomeIcon,

  // Dominio LiftGo
  Truck as FleetIcon,
  Wrench as MaintenanceIcon,
  FileText as DocumentIcon,
  Receipt as InvoiceIcon,
  DollarSign as MoneyIcon,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  User as UserIcon,
  Users as UsersIcon,
  Building2 as CompanyIcon,
  ShieldCheck as SecurityIcon,
  Package as InventoryIcon,
  History as HistoryIcon,
  Phone as PhoneIcon,
  MapPin as LocationIcon,
  Landmark as BankIcon,
  Handshake as DealIcon,
  Stamp as StampIcon,
  Settings as SettingsIcon,
  LayoutDashboard as DashboardIcon,
  BarChart3 as ChartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Target as TargetIcon,
  Trophy as TrophyIcon,
  Activity as ActivityIcon,
  Star as StarIcon,
  HelpCircle as HelpIcon,
  KeyRound as KeyIcon,
} from "lucide-react";

// -----------------------------------------------------------------------------
// 2. Re-export completo — para íconos sin alias canónico todavía.
//    Preserva tree-shaking (lucide-react es ESM puro).
// -----------------------------------------------------------------------------
export * from "lucide-react";

// -----------------------------------------------------------------------------
// 3. Tipo estándar para consumidores.
// -----------------------------------------------------------------------------
export type { LucideIcon } from "lucide-react";
