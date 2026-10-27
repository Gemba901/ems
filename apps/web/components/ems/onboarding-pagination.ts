export const PAGE_SIZES = [25, 50, 100] as const;
export function pageWindow<T>(rows: readonly T[], requested: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requested) || 1));
  const start = (page - 1) * size;
  return { page, pages, start, end: Math.min(start + size, rows.length), rows: rows.slice(start, start + size) };
}
export function recordPage(rows: readonly { id: string }[], id: string | undefined, size: number): number | null {
  const index = id ? rows.findIndex(row => row.id === id) : -1;
  return index < 0 ? null : Math.floor(index / size) + 1;
}
