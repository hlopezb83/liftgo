export function countLabel(count: number | undefined, singular: string, plural: string): string {
  return `${count ?? 0} ${count === 1 ? singular : plural}`;
}
