"use client";

import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityIngestionSummary,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import ActivityTabs from "../ActivityTabs";
import { DwmsDataField, DwmsMobileDataCard } from "../../components/DwmsResponsive";

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClass(status: string) {
  if (status === "COMPLETED") return "bg-success-subtle text-success";
  if (status === "FAILED") return "bg-danger-subtle text-danger";
  return "bg-info-subtle text-info";
}

export default function ActivityIngestionsPage() {
  return (
    <ProtectedRoute>
      <ActivityIngestionsContent />
    </ProtectedRoute>
  );
}

function ActivityIngestionsContent() {
  const { accessToken, user } = useAuthStore();
  const [ingestions, setIngestions] = useState<DwmsActivityIngestionSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      if (!accessToken) return;
      setLoading(true);
      setMessage(null);
      try {
        const result = await DwmsService.getActivityIngestions(accessToken);
        if (mounted) setIngestions(result.ingestions ?? []);
      } catch (error) {
        if (mounted)
          setMessage(
            getDwmsErrorMessage(error, "Failed to load ingestion history"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadHistory();
    return () => {
      mounted = false;
    };
  }, [accessToken, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingestions;
    return ingestions.filter((ingestion) =>
      [ingestion.fileName, ingestion.status, ingestion.uploadedBy?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ingestions, search]);

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-10 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <PageHeader title="Ingestion History" />
      <ActivityTabs active="ingestions" />
      {message && (
        <div className="rounded-xl border border-danger bg-danger-subtle p-4 text-xs text-danger">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search file, uploader, status..."
            className="min-h-11 w-full rounded-xl border border-border bg-card py-2.5 pr-4 pl-10 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info sm:rounded-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant="ghost"
            type="button"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-50 sm:rounded-full sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link
            href="/dwms/actions/new?mode=ACTIVITY"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-info px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-info sm:rounded-full sm:px-4"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Import sheet</span>
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ingestion history...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No ingestion history found.
          </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {filtered.map((ingestion) => (
              <DwmsMobileDataCard key={ingestion.id}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="min-w-0 break-all font-semibold text-foreground">{ingestion.fileName}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ingestion.status)}`}>{ingestion.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <DwmsDataField label="Uploaded by">{ingestion.uploadedBy?.name ?? "Unknown"}</DwmsDataField>
                  <DwmsDataField label="Uploaded">{formatDateTime(ingestion.createdAt, user?.organizationTimeZone)}</DwmsDataField>
                  <DwmsDataField label="Total rows">{ingestion.totalRows}</DwmsDataField>
                  <DwmsDataField label="Result"><span className="text-success">{ingestion.successfulRows} created</span><span className="mx-1 text-muted-foreground">·</span><span className="text-danger">{ingestion.failedRows} declined</span></DwmsDataField>
                </div>
                <Link href={`/dwms/activities/ingestions/${ingestion.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-info px-4 text-sm font-semibold text-primary-foreground">
                  View row details <ArrowRight className="h-4 w-4" />
                </Link>
              </DwmsMobileDataCard>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-full divide-y divide-border text-sm">
              <TableHeader className="bg-muted text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <TableRow>
                  <TableHead className="px-5 py-3">File</TableHead>
                  <TableHead className="px-5 py-3">Uploaded By</TableHead>
                  <TableHead className="px-5 py-3">Rows</TableHead>
                  <TableHead className="px-5 py-3">Created</TableHead>
                  <TableHead className="px-5 py-3">Declined</TableHead>
                  <TableHead className="px-5 py-3">Status</TableHead>
                  <TableHead className="px-5 py-3">Uploaded</TableHead>
                  <TableHead className="px-5 py-3 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {filtered.map((ingestion) => (
                  <TableRow key={ingestion.id} className="hover:bg-muted/70">
                    <TableCell className="px-5 py-4 font-semibold text-foreground">
                      {ingestion.fileName}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">
                      {ingestion.uploadedBy?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">
                      {ingestion.totalRows}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-success">
                      {ingestion.successfulRows}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-danger">
                      {ingestion.failedRows}
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ingestion.status)}`}
                      >
                        {ingestion.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">
                      {formatDateTime(
                        ingestion.createdAt,
                        user?.organizationTimeZone,
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <Link
                        href={`/dwms/activities/ingestions/${ingestion.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted"
                        title="View row details"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
