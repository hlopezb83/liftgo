type PageResult<T> = {
  data: readonly T[] | null;
  error: unknown | null;
};

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("pageSize must be a positive integer.");
  }

  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    if (page.length > pageSize) {
      throw new Error("The page query returned more rows than requested.");
    }

    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
