/**
 * Registro central de íconos.
 *
 * Regla del proyecto: NINGÚN archivo fuera de `src/components/icons/` debe
 * importar directamente de `lucide-react`. En su lugar:
 *
 *   import { DeleteIcon, EditIcon, AddIcon } from "@/components/icons";
 *
 * o para casos ad-hoc (íconos sin alias semántico):
 *
 *   import { Truck, Wrench } from "@/components/icons";
 *
 * Esto nos permite:
 *   1. Consolidar duplicados semánticos (Check/CheckCircle/CheckCircle2 → SuccessIcon).
 *   2. Renombrar/cambiar de librería sin tocar 246 archivos.
 *   3. Enforzar la disciplina vía ESLint (no-restricted-imports).
 */

// -----------------------------------------------------------------------------
// 1. Aliases semánticos canónicos — usar SIEMPRE que aplique la acción.
// -----------------------------------------------------------------------------
export {
  // Acciones CRUD
  Plus as AddIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Save as SaveIcon,
  Copy as DuplicateIcon,
  RefreshCw as RefreshIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Eye as ViewIcon,
  Search as SearchIcon,

  // Estado / feedback (dedupe: Check/CheckCircle/CheckCircle2 → SuccessIcon)
  CheckCircle2 as SuccessIcon,
  AlertTriangle as WarnIcon,
  XCircle as ErrorIcon,
  AlertCircle as InfoAlertIcon,
  Loader2 as SpinnerIcon,

  // Navegación
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronUp as ChevronUpIcon,
  ArrowLeft as BackIcon,
  X as CloseIcon,

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
  TrendingUp as TrendingUpIcon,
  Trophy as TrophyIcon,
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
