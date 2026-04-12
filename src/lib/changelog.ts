export interface ChangelogEntry {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  title: string;
  description: string;
  changes: string[];
}

let _cache: ChangelogEntry[] | null = null;

export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  if (_cache) return _cache;
  const res = await fetch("/changelog.json");
  _cache = await res.json();
  return _cache!;
}

export function getCurrentVersion(entries: ChangelogEntry[]): string {
  return entries.length > 0 ? entries[0].version : "0.0.0";
}
