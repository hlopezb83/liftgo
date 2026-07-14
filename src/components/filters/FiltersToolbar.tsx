import type { ReactNode } from "react";
import { SearchBar } from "@/components/forms/SearchBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Toolbar de filtros canónica.
 *
 * Convenciones de UX (v7.62.0):
 * - Los filtros van en una sola fila responsive (wrap en móvil).
 * - Búsqueda a la izquierda, facetas en el centro, "Limpiar" a la derecha.
 * - Status con ≤5 opciones → `<Tabs>`; con >5 → `<Select>`.
 * - El botón "Limpiar filtros" sólo aparece si hay filtros activos.
 */

interface RootProps {
  children: ReactNode;
  className?: string;
}

function Root({ children, className }: RootProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function Search({ value, onChange, placeholder, className }: SearchProps) {
  return (
    <SearchBar
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? "Buscar…"}
      className={className ?? "w-full sm:w-64"}
    />
  );
}

interface StatusTabsProps<V extends string> {
  value: V | "all";
  onChange: (value: V | "all") => void;
  options: readonly { value: V | "all"; label: string }[];
  className?: string;
}

function StatusTabs<V extends string>({
  value,
  onChange,
  options,
  className,
}: StatusTabsProps<V>) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as V | "all")}
      className={className}
    >
      <TabsList>
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface StatusSelectProps<V extends string> {
  value: V | "all";
  onChange: (value: V | "all") => void;
  options: readonly { value: V | "all"; label: string }[];
  placeholder?: string;
  className?: string;
}

function StatusSelect<V extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
}: StatusSelectProps<V>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as V | "all")}>
      <SelectTrigger className={cn("w-full sm:w-48", className)}>
        <SelectValue placeholder={placeholder ?? "Todos"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ClearAllProps {
  onClick: () => void;
  visible: boolean;
  label?: string;
}

function ClearAll({ onClick, visible, label }: ClearAllProps) {
  if (!visible) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground gap-1.5"
    >
      <XIcon className="h-3.5 w-3.5" />
      {label ?? "Limpiar filtros"}
    </Button>
  );
}

export const FiltersToolbar = Object.assign(Root, {
  Search,
  StatusTabs,
  StatusSelect,
  ClearAll,
});

export type FilterOption<V extends string = string> = {
  value: V | "all";
  label: string;
};
