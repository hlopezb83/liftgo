import type { SelectOption } from "@/components/forms/fields";

export const PART_CATEGORIES = ["Filtros", "Llantas", "Aceites", "Baterías", "Otros"] as const;

export const CATEGORY_OPTIONS: SelectOption[] = PART_CATEGORIES.map((c) => ({ value: c, label: c }));
