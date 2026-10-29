"use client";
import { useState, type ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  FilterBar,
  EMPTY_FILTERS,
  type FilterDefinition,
  type FilterValues,
} from "./FilterBar";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
}
interface DataTableBaseProps<T> {
  caption: string;
  rows: readonly T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchText?: (row: T) => string;
  pageSize?: number;
  rowActions?: (row: T) => ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
}
/** Enabling domain filters requires a predicate; field names are never guessed. */
export type DataTableProps<T> = DataTableBaseProps<T> &
  (
    | {
        filters?: never;
        dateRange?: false;
        matchesFilters?: (row: T, values: FilterValues) => boolean;
      }
    | {
        filters?: FilterDefinition[];
        dateRange?: boolean;
        matchesFilters: (row: T, values: FilterValues) => boolean;
      }
  );
/** Client-side table: pass the complete collection. Server pagination belongs to the caller, not this API. */
export function DataTable<T>({
  caption,
  rows,
  columns,
  getRowId,
  searchText,
  filters = [],
  matchesFilters,
  dateRange = false,
  pageSize = 10,
  rowActions,
  loading = false,
  error,
  onRetry,
  emptyTitle = "No matching records",
}: DataTableProps<T>) {
  const [values, setValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const size = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 10;
  const query = values.search.trim().toLocaleLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!query ||
        !searchText ||
        searchText(row).toLocaleLowerCase().includes(query)) &&
      (!matchesFilters || matchesFilters(row, values)),
  );
  const column = columns.find((c) => c.id === sort?.id);
  const sorted = column?.sortValue
    ? [...filtered].sort((a, b) => {
        const av = column.sortValue!(a),
          bv = column.sortValue!(b);
        const result =
          av == null
            ? bv == null
              ? 0
              : 1
            : bv == null
              ? -1
              : typeof av === "number" && typeof bv === "number"
                ? av - bv
                : String(av).localeCompare(String(bv), undefined, {
                    numeric: true,
                  });
        return sort?.desc ? -result : result;
      })
    : filtered;
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * size, (current + 1) * size);
  return (
    <div className="space-y-4">
      {searchText || filters.length || dateRange ? (
        <FilterBar
          searchable={!!searchText}
          value={values}
          filters={filters}
          dateRange={dateRange}
          disabled={loading}
          onChange={(next) => {
            setValues(next);
            setPage(0);
          }}
        />
      ) : null}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState description={error} onRetry={onRetry} />
      ) : (
        <>
          <Table>
            <TableCaption>{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.id}
                    scope="col"
                    aria-sort={
                      col.sortValue
                        ? sort?.id === col.id
                          ? sort.desc
                            ? "descending"
                            : "ascending"
                          : "none"
                        : undefined
                    }
                  >
                    {col.sortValue ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSort({
                            id: col.id,
                            desc: sort?.id === col.id ? !sort.desc : false,
                          });
                          setPage(0);
                        }}
                      >
                        {col.header}
                        <ArrowUpDown aria-hidden="true" />
                      </Button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
                {rowActions && <TableHead scope="col">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.id}>{col.cell(row)}</TableCell>
                  ))}
                  {rowActions && (
                    <TableCell>
                      <div className="flex gap-control">{rowActions(row)}</div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!shown.length && (
            <EmptyState
              title={emptyTitle}
              description="Try changing or resetting your filters."
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-control">
            <p role="status" className="text-caption text-muted-foreground">
              {sorted.length ? current * size + 1 : 0}–
              {Math.min((current + 1) * size, sorted.length)} of {sorted.length}{" "}
              records · Page {current + 1} of {pages}
            </p>
            <div className="flex gap-control">
              <Button
                type="button"
                variant="outline"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
