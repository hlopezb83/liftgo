import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FISCAL_OPERATIONS, FISCAL_QUEUE_STATUSES, type FiscalJobsInput } from "@/lib/platformFiscalJobs.types";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";

const selectClass = "h-11 w-full rounded-md border bg-background px-3 text-sm";
export function PlatformFiscalJobFilters({ filters, search, onSearch, onChange }: {
  filters: FiscalJobsInput; search: string; onSearch: (value: string) => void; onChange: (value: FiscalJobsInput) => void;
}) {
  const companies = usePlatformOrganizations(true);
  return <form className="grid items-end gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] sm:p-6"
    onSubmit={(event) => { event.preventDefault(); onChange({ ...filters, search: search.trim(), offset: 0 }); }}>
    <div className="space-y-2 sm:col-span-2 lg:col-span-1"><Label htmlFor="fiscal-job-search">Buscar empresa, folio o ID</Label>
      <div className="flex gap-2"><Input id="fiscal-job-search" className="min-h-11" value={search} maxLength={100} onChange={(event) => onSearch(event.target.value)} />
        <Button type="submit" variant="outline" className="min-h-11">Buscar</Button></div></div>
    <div className="space-y-2"><Label htmlFor="fiscal-job-status">Estado de cola</Label>
      <select id="fiscal-job-status" className={selectClass} value={filters.status ?? ""}
        onChange={(event) => onChange({ ...filters, status: event.target.value as FiscalJobsInput["status"] || null, offset: 0 })}>
        <option value="">Todos los estados</option>{Object.entries(FISCAL_QUEUE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="fiscal-job-operation">Operación</Label>
      <select id="fiscal-job-operation" className={selectClass} value={filters.operation ?? ""}
        onChange={(event) => onChange({ ...filters, operation: event.target.value as FiscalJobsInput["operation"] || null, offset: 0 })}>
        <option value="">Todas las operaciones</option>{Object.entries(FISCAL_OPERATIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="space-y-2 sm:col-span-2 lg:col-span-1"><Label htmlFor="fiscal-job-company">Empresa</Label>
      <select id="fiscal-job-company" className={selectClass} value={filters.organizationId ?? ""} disabled={companies.isPending || companies.isError}
        onChange={(event) => onChange({ ...filters, organizationId: event.target.value || null, offset: 0 })}>
        <option value="">Todas las empresas</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.razon_social || company.name}</option>)}</select>
      {companies.isError && <Button type="button" size="sm" variant="outline" onClick={() => void companies.refetch()}>Reintentar empresas</Button>}</div>
  </form>;
}
