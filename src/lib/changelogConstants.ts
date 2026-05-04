import type { ChangelogType, ChangelogCategory } from "@/lib/changelog";

export type FilterType = "all" | ChangelogType;
export type FilterCategory = "all" | ChangelogCategory;

export const TYPE_LABELS: Record<ChangelogType, string> = {
  major: "Mayor", minor: "Menor", patch: "Parche",
};

export const TYPE_COLORS: Record<ChangelogType, string> = {
  major: "bg-destructive text-destructive-foreground",
  minor: "bg-primary text-primary-foreground",
  patch: "bg-muted text-muted-foreground",
};

export const DOT_COLORS: Record<ChangelogType, string> = {
  major: "bg-destructive",
  minor: "bg-primary",
  patch: "bg-muted-foreground",
};

export const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  feature: "Funcionalidad",
  fix: "Corrección",
  docs: "Documentación",
  refactor: "Refactor",
  security: "Seguridad",
};

export const TYPE_FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "major", label: "Mayor" },
  { value: "minor", label: "Menor" },
  { value: "patch", label: "Parche" },
];

export const CATEGORY_FILTERS: { value: FilterCategory; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "feature", label: "Funcionalidad" },
  { value: "fix", label: "Corrección" },
  { value: "docs", label: "Documentación" },
  { value: "refactor", label: "Refactor" },
  { value: "security", label: "Seguridad" },
];
