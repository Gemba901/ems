"use client";
import { useState, type FormEvent } from "react";
import { Ticket, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageSection, SectionCard } from "@/components/patterns/PageSection";
import { StatCard } from "@/components/patterns/StatCard";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { DataTable } from "@/components/patterns/DataTable";
import { FilterBar, EMPTY_FILTERS } from "@/components/patterns/FilterBar";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";
import { FormField } from "@/components/patterns/FormField";
import { FormSection } from "@/components/patterns/FormSection";
import { FormActions } from "@/components/patterns/FormActions";
import { DetailList } from "@/components/patterns/DetailList";
import { Timeline, ActivityFeed } from "@/components/patterns/Timeline";
import { ChartCard } from "@/components/patterns/ChartCard";
import { Checkbox } from "@/components/ui/checkbox";
const tickets = [
  { id: "T-101", title: "Replace scanner", status: "OPEN", date: "2026-10-27" },
  {
    id: "T-102",
    title: "Printer offline",
    status: "IN_PROGRESS",
    date: "2026-10-28",
  },
  {
    id: "T-103",
    title: "Restore dashboard access",
    status: "RESOLVED",
    date: "2026-10-29",
  },
];
const history = [
  {
    id: "created",
    title: "Ticket created",
    actor: "Demo requester",
    dateTime: "2026-10-27T08:00:00+03:00",
    timeLabel: "27 October, 08:00",
    description: "Scanner unavailable at receiving.",
  },
  {
    id: "assigned",
    title: "Assigned to support",
    actor: "Demo coordinator",
    dateTime: "2026-10-27T08:15:00+03:00",
    timeLabel: "27 October, 08:15",
    icon: <Check />,
  },
];
export function PatternShowcase() {
  const [tableState, setTableState] = useState<
    "ready" | "loading" | "error" | "empty"
  >("ready");
  const [selected, setSelected] = useState(tickets[0]);
  const [open, setOpen] = useState(false);
  const [fail, setFail] = useState(false);
  const [result, setResult] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter a ticket title.");
      return;
    }
    setError("");
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setResult("Demo ticket saved locally; no API request sent.");
    setPending(false);
  }
  return (
    <section
      aria-label="Phase 2 pattern kit"
      className="space-y-section border-t border-border pt-6"
    >
      <PageHeader
        title="Phase 2 · Pattern kit"
        description="Tickets pilot: list, detail, form and dashboard compositions. Fixture data only; production pages are unchanged."
        breadcrumbs={[{ label: "UI kit", href: "#" }, { label: "Patterns" }]}
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            Confirm demo action
          </Button>
        }
      />
      <PageSection title="Dashboard patterns">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Open tickets"
            value="12"
            icon={<Ticket />}
            trend={{ label: "3 fewer than last week", tone: "success" }}
          />
          <StatCard
            label="In progress"
            value="4"
            description="Awaiting support resolution"
          />
          <StatCard label="Resolved" value="28" />
        </div>
        <ChartCard
          title="Tickets by day"
          description="Accessible data table is available below the chart."
          categoryKey="day"
          data={[
            { day: "Mon", opened: 5, resolved: 3 },
            { day: "Tue", opened: 3, resolved: 4 },
            { day: "Wed", opened: 4, resolved: 6 },
          ]}
          series={[
            { key: "opened", label: "Opened", token: "chart-1" },
            { key: "resolved", label: "Resolved", token: "chart-2" },
          ]}
        />
      </PageSection>
      <SectionCard
        title="Ticket list"
        description="Search, sort, status/date filters, pagination and row actions."
      >
        <div
          className="flex flex-wrap gap-control"
          aria-label="Table demo states"
        >
          {(["ready", "loading", "error", "empty"] as const).map((state) => (
            <Button
              type="button"
              key={state}
              variant={tableState === state ? "default" : "outline"}
              onClick={() => setTableState(state)}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)} table
            </Button>
          ))}
        </div>
        <DataTable
          caption="Demo tickets"
          loading={tableState === "loading"}
          error={tableState === "error" ? "Demo table error" : undefined}
          onRetry={() => setTableState("ready")}
          rows={tableState === "empty" ? [] : tickets}
          getRowId={(row) => row.id}
          pageSize={2}
          searchText={(row) => `${row.id} ${row.title}`}
          filters={[
            {
              id: "status",
              label: "Status",
              options: [
                { value: "OPEN", label: "Open" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "RESOLVED", label: "Resolved" },
              ],
            },
          ]}
          dateRange
          matchesFilters={(row, v) =>
            (!v.filters.status || row.status === v.filters.status) &&
            (!v.from || row.date >= v.from) &&
            (!v.to || row.date <= v.to)
          }
          columns={[
            {
              id: "id",
              header: "Reference",
              cell: (row) => row.id,
              sortValue: (row) => row.id,
            },
            {
              id: "title",
              header: "Title",
              cell: (row) => row.title,
              sortValue: (row) => row.title,
            },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge status={row.status} />,
            },
          ]}
          rowActions={(row) => (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(row)}
              aria-label={`View ${row.id}`}
            >
              View
            </Button>
          )}
        />
      </SectionCard>
      <div className="grid gap-section lg:grid-cols-2">
        <SectionCard title={`Ticket detail · ${selected.id}`}>
          <DetailList
            items={[
              { label: "Title", value: selected.title },
              {
                label: "Status",
                value: <StatusBadge status={selected.status} />,
              },
              { label: "Created", value: selected.date },
              { label: "Assignee", value: null },
            ]}
          />
          <Timeline items={history} />
        </SectionCard>
        <SectionCard title="Ticket form">
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormSection
              title="Request details"
              description="A minimal form demonstrating shared field and action patterns."
            >
              <FormField
                label="Ticket title"
                required
                description="Briefly describe the issue."
                error={error}
              >
                <Input
                  value={title}
                  disabled={pending}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </FormField>
            </FormSection>
            <FormActions
              pending={pending}
              submitLabel="Save demo ticket"
              onCancel={() => {
                setTitle("");
                setError("");
              }}
            />
          </form>
          <p role="status" className="mt-3 text-body">
            {result}
          </p>
        </SectionCard>
      </div>
      <SectionCard title="Standalone filters">
        <FilterBar value={filters} onChange={setFilters} dateRange />
      </SectionCard>
      <SectionCard title="Data states">
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState
            title="No tickets"
            description="Create a ticket to begin."
            action={
              <Button
                type="button"
                onClick={() => setResult("Use the ticket form above.")}
              >
                Create ticket
              </Button>
            }
          />
          <LoadingState />
          <ErrorState onRetry={() => setResult("Demo retry requested.")} />
        </div>
      </SectionCard>
      <SectionCard title="Approval activity">
        <ActivityFeed items={history} />
      </SectionCard>
      <SectionCard title="Chart states">
        <div className="grid gap-4 md:grid-cols-3">
          <ChartCard
            title="Loading chart"
            data={[]}
            categoryKey="day"
            series={[]}
            loading
          />
          <ChartCard
            title="Empty chart"
            data={[]}
            categoryKey="day"
            series={[]}
          />
          <ChartCard
            title="Failed chart"
            data={[]}
            categoryKey="day"
            series={[]}
            error="Demo chart error"
            onRetry={() => setResult("Chart retry requested.")}
          />
        </div>
      </SectionCard>
      <SectionCard
        title="Confirmation behaviour"
        description="Failures stay open for retry; pending actions cannot be submitted twice."
      >
        <label className="flex items-center gap-control text-body">
          <Checkbox
            checked={fail}
            onCheckedChange={(checked) => setFail(checked)}
          />
          Simulate confirmation failure
        </label>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          Resolve demo ticket
        </Button>
      </SectionCard>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Resolve demo ticket?"
        description="This demonstration does not change a real ticket."
        confirmLabel="Resolve ticket"
        destructive
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 350));
          if (fail) throw new Error("Demo failure");
          setResult("Demo confirmation completed.");
        }}
      />
    </section>
  );
}
