export type ChangelogType = "major" | "minor" | "patch";
export type ChangelogCategory = "feature" | "fix" | "docs" | "refactor" | "security";

export interface ChangelogIndexEntry {
  version: string;
  date: string;
  type: ChangelogType;
  title: string;
  category?: ChangelogCategory;
}

export interface ChangelogDetail {
  description: string;
  changes: string[];
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: ChangelogType[] = ["major", "minor", "patch"];
const CATEGORIES: ChangelogCategory[] = ["feature", "fix", "docs", "refactor", "security"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseIndexEntry(raw: unknown, idx: number): ChangelogIndexEntry {
  if (!isRecord(raw)) throw new Error(`Entrada #${idx} no es objeto`);
  const { version, date, type, title, category } = raw;
  if (typeof version !== "string" || !SEMVER.test(version)) throw new Error(`Entrada #${idx}: versión inválida`);
  if (typeof date !== "string" || !ISO_DATE.test(date)) throw new Error(`Entrada #${idx}: fecha inválida`);
  if (typeof type !== "string" || !TYPES.includes(type as ChangelogType)) throw new Error(`Entrada #${idx}: type inválido`);
  if (typeof title !== "string" || title.length === 0) throw new Error(`Entrada #${idx}: título vacío`);
  const entry: ChangelogIndexEntry = { version, date, type: type as ChangelogType, title };
  if (typeof category === "string" && CATEGORIES.includes(category as ChangelogCategory)) {
    entry.category = category as ChangelogCategory;
  }
  return entry;
}

function parseDetail(raw: unknown): ChangelogDetail {
  if (!isRecord(raw)) throw new Error("Detalle no es objeto");
  const { description, changes } = raw;
  if (typeof description !== "string") throw new Error("description inválida");
  if (!Array.isArray(changes) || !changes.every((c) => typeof c === "string")) throw new Error("changes inválidos");
  return { description, changes };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
  return 0;
}

export function sortEntries<T extends { date: string; version: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return compareSemver(a.version, b.version);
  });
}

export async function fetchChangelogIndex(): Promise<ChangelogIndexEntry[]> {
  const res = await fetch("/changelog.json", { cache: "default" });
  if (!res.ok) throw new Error(`No se pudo cargar el changelog (HTTP ${res.status})`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("changelog.json no es un arreglo");
  return sortEntries(json.map(parseIndexEntry));
}

export async function fetchChangelogDetail(version: string): Promise<ChangelogDetail> {
  const res = await fetch(`/changelog/v${version}.json`, { cache: "default" });
  if (!res.ok) throw new Error(`No se pudo cargar el detalle de v${version}`);
  const json: unknown = await res.json();
  return parseDetail(json);
}

export function getCurrentVersion(entries: ChangelogIndexEntry[]): string {
  if (entries.length === 0) return "0.0.0";
  return sortEntries(entries)[0].version;
}
