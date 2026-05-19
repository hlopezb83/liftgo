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

function splitVersion(v: string): { core: number[]; pre: string | null } {
  const dash = v.indexOf("-");
  const core = (dash === -1 ? v : v.slice(0, dash)).split(".").map(Number);
  const pre = dash === -1 ? null : v.slice(dash + 1);
  return { core, pre };
}

type Token = { kind: "num"; value: number } | { kind: "str"; value: string };

function parseToken(s: string): Token {
  return /^\d+$/.test(s) ? { kind: "num", value: Number(s) } : { kind: "str", value: s };
}

function compareTokens(a: Token, b: Token): number {
  if (a.kind === "num" && b.kind === "num") return a.value - b.value;
  if (a.kind !== b.kind) return a.kind === "num" ? -1 : 1;
  return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
}

function comparePre(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const diff = compareTokens(parseToken(pa[i]), parseToken(pb[i]));
    if (diff !== 0) return diff;
  }
  return 0;
}

function compareSemver(a: string, b: string): number {
  const sa = splitVersion(a);
  const sb = splitVersion(b);
  for (let i = 0; i < 3; i++) if (sa.core[i] !== sb.core[i]) return sb.core[i] - sa.core[i];
  if (sa.pre === sb.pre) return 0;
  if (sa.pre === null) return -1;
  if (sb.pre === null) return 1;
  return comparePre(sb.pre, sa.pre);
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
