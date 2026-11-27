"use client";
import type { ReactNode } from "react";
import {
  PageHeader,
  type PageHeaderProps,
} from "@/components/patterns/PageHeader";
import {
  DataTable,
  type DataTableProps,
} from "@/components/patterns/DataTable";
export interface ListPageTemplateProps<T> {
  header: PageHeaderProps;
  table: DataTableProps<T>;
  beforeTable?: ReactNode;
  afterTable?: ReactNode;
}
/** DataTable owns its FilterBar: avoid rendering a second independent filter state. */
export function ListPageTemplate<T>({
  header,
  table,
  beforeTable,
  afterTable,
}: ListPageTemplateProps<T>) {
  return (
    <div
      data-slot="list-page-template"
      className="min-w-0 space-y-section text-body"
    >
      <PageHeader {...header} />
      {beforeTable}
      <div className="min-w-0 rounded-xl border border-border bg-card p-card text-card-foreground">
        <DataTable {...table} />
      </div>
      {afterTable}
    </div>
  );
}
