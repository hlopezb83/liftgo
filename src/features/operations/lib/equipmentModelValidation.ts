// R7 Bloque 19c: helpers puros reutilizables y testables para modelos de equipo.

export type EquipmentModelLike = {
  id: string;
  manufacturer: string;
  model: string;
};

const norm = (s: string) => s.trim().toLowerCase();

export function isDuplicateModel(
  models: ReadonlyArray<EquipmentModelLike>,
  manufacturer: string,
  model: string,
  ignoreId: string | null,
): boolean {
  const m = norm(manufacturer);
  const mm = norm(model);
  return models.some((x) => x.id !== ignoreId && norm(x.manufacturer) === m && norm(x.model) === mm);
}

export function validateNonNegative(raw: string, label: string): string | null {
  if (!raw) return null;
  const value = parseFloat(raw);
  if (Number.isNaN(value) || value < 0) return `${label} debe ser mayor o igual a 0`;
  return null;
}

export function countUnitsForModel(
  forklifts: ReadonlyArray<{ manufacturer: string | null; model: string | null }>,
  manufacturer: string,
  model: string,
): number {
  const key = `${norm(manufacturer)}||${norm(model)}`;
  let n = 0;
  for (const f of forklifts) {
    if (`${norm(f.manufacturer ?? "")}||${norm(f.model ?? "")}` === key) n += 1;
  }
  return n;
}
