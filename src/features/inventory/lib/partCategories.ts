/**
 * R14-FE-05: en la BD conviven categorías capturadas por la UI ("Filtros") y
 * valores legacy tipo slug ("refaccion", "aceite"). Mostrarlos crudos rompe la
 * localización es-MX, así que se traducen en un único diccionario.
 */
export const PART_CATEGORY_LABELS: Record<string, string> = {
  filtros: "Filtros",
  filtro: "Filtros",
  llantas: "Llantas",
  llanta: "Llantas",
  aceites: "Aceites",
  aceite: "Aceites",
  baterias: "Baterías",
  bateria: "Baterías",
  refaccion: "Refacción",
  refacciones: "Refacciones",
  consumible: "Consumible",
  consumibles: "Consumibles",
  otros: "Otros",
  otro: "Otros",
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Devuelve la etiqueta en español; si no está mapeada, capitaliza el valor. */
export function partCategoryLabel(category: string | null | undefined): string {
  const raw = (category ?? "").trim();
  if (raw === "") return "Sin categoría";
  const key = stripAccents(raw.toLowerCase());
  const mapped = PART_CATEGORY_LABELS[key];
  if (mapped !== undefined) return mapped;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}
