import { z } from "zod";

export const ChangelogTypeSchema = z.enum(["major", "minor", "patch"]);
export const ChangelogCategorySchema = z.enum(["feature", "fix", "docs", "refactor", "security"]);

export const ChangelogIndexEntrySchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Versión semver requerida"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha ISO YYYY-MM-DD"),
  type: ChangelogTypeSchema,
  title: z.string().min(1),
  category: ChangelogCategorySchema.optional(),
});

export const ChangelogDetailSchema = z.object({
  description: z.string(),
  changes: z.array(z.string()),
});

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
export type ChangelogEntry = ChangelogIndexEntry & Partial<ChangelogDetail>;
export type ChangelogEntry = ChangelogIndexEntry & Partial<ChangelogDetail>;

/** Compara semver descendente. */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

/** Ordena por fecha desc, desempate por semver desc. */
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
  const parsed = z.array(ChangelogIndexEntrySchema).parse(json);
  return sortEntries(parsed);
}

export async function fetchChangelogDetail(version: string): Promise<ChangelogDetail> {
  const res = await fetch(`/changelog/v${version}.json`, { cache: "default" });
  if (!res.ok) throw new Error(`No se pudo cargar el detalle de v${version}`);
  const json: unknown = await res.json();
  return ChangelogDetailSchema.parse(json);
}

export function getCurrentVersion(entries: ChangelogIndexEntry[]): string {
  if (entries.length === 0) return "0.0.0";
  return sortEntries(entries)[0].version;
}
