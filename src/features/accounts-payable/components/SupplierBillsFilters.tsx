import { format } from "date-fns";
import { SearchBar } from "@/components/forms/SearchBar";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { capitalize, parseDateLocal } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_GROUPS,
  SUPPLIER_BILL_STATUSES, SUPPLIER_BILL_STATUS_LABELS,
  APPROVAL_STATUSES, APPROVAL_STATUS_LABELS,
} from "../lib/supplierBillConstants";
import { SUPPLIER_REP_STATUSES, SUPPLIER_REP_STATUS_LABELS } from "../lib/supplierRepConstants";
import { AccountsPayableKpiCards } from "./AccountsPayableKpiCards";
import type { useAccountsPayableFilters } from "../hooks/useAccountsPayableFilters";
import type { useAccountsPayableKpis } from "../hooks/useAccountsPayableKpis";

interface Supplier { id: string; name: string }

interface Props {
  filters: ReturnType<typeof useAccountsPayableFilters>;
  kpis: ReturnType<typeof useAccountsPayableKpis>["kpis"];
  suppliers: Supplier[] | undefined;
}

export function SupplierBillsFilters({ filters: f, kpis, suppliers }: Props) {
  return (
    <div className="space-y-3">
      <AccountsPayableKpiCards kpis={kpis} />
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <SearchBar
          value={f.search}
          onChange={(v) => f.set("search", v)}
          placeholder="Folio, UUID, proveedor o descripción…"
          className="sm:max-w-xs"
        />
        <Select value={f.status} onValueChange={(v) => f.set("status", v as typeof f.status)}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estatus</SelectItem>
            {SUPPLIER_BILL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{SUPPLIER_BILL_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.supplierId} onValueChange={(v) => f.set("supplierId", v)}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {(suppliers ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.month} onValueChange={(v) => f.set("month", v)}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los meses</SelectItem>
            {f.availableMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {capitalize(format(parseDateLocal(m + "-15"), "MMM yyyy", { locale: APP_LOCALE }))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.category} onValueChange={(v) => f.set("category", v as typeof f.category)}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {EXPENSE_CATEGORY_GROUPS.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.categories.map((v) => (
                  <SelectItem key={v} value={v}>{EXPENSE_CATEGORY_LABELS[v]}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.approval} onValueChange={(v) => f.set("approval", v as typeof f.approval)}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas aprobaciones</SelectItem>
            {APPROVAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{APPROVAL_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.rep} onValueChange={(v) => f.set("rep", v as typeof f.rep)}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">REP: Todos</SelectItem>
            {SUPPLIER_REP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>REP: {SUPPLIER_REP_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
